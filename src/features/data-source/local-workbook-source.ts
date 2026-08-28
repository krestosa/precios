import * as XLSX from 'xlsx';

import type { Diagnostic } from '../../domain/contracts/core';
import type {
  LocalWorkbookSource,
  SourceCell,
  SourceLoc,
  SourceRow,
  SourceSnapshot,
} from '../../domain/contracts/source';
import { columnIndexToLabel, parseDelimitedText } from '../../utils/parsing/tabular';

export type LocalDataDiagnosticCode =
  | 'DATA_UNSUPPORTED_FILE_TYPE'
  | 'DATA_PARSE_FAILED'
  | 'DATA_WORKBOOK_EMPTY'
  | 'DATA_WORKBOOK_RANGE_TOO_LARGE';

export interface LocalWorkbookInput {
  readonly sourceId: string;
  readonly fileName: string;
  readonly data: ArrayBuffer | Uint8Array;
  readonly fileId?: string;
  readonly csvDelimiter?: string;
}

export interface LocalWorkbookLoadResult {
  readonly source: LocalWorkbookSource;
  readonly snapshots: readonly SourceSnapshot[];
  readonly diagnostics: readonly Diagnostic[];
}

const MAX_WORKBOOK_CELLS = 1_000_000;

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  return new TextDecoder('utf-8').decode(bytes);
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex < 0 ? '' : fileName.slice(dotIndex + 1).toLowerCase();
}

function sourceLoc(sheet: string, row: number, column: number): SourceLoc {
  const columnLabel = columnIndexToLabel(column);
  return {
    sheet,
    row,
    column,
    cell: `${columnLabel}${row}`,
  };
}

function createCell(
  sheet: string,
  row: number,
  column: number,
  value: SourceCell['value'],
): SourceCell {
  return {
    key: columnIndexToLabel(column),
    value,
    loc: sourceLoc(sheet, row, column),
  };
}

function createSource(input: LocalWorkbookInput): LocalWorkbookSource {
  return {
    kind: 'local-workbook',
    meta: {
      id: input.sourceId,
      label: input.fileName,
      origin: input.fileName,
    },
    ...(input.fileId === undefined ? {} : { fileId: input.fileId }),
  };
}

function createSnapshot(
  input: LocalWorkbookInput,
  sheet: string,
  rows: readonly SourceRow[],
  diagnostics: readonly Diagnostic[],
  status: SourceSnapshot['status'] = 'ready',
): SourceSnapshot {
  return {
    kind: 'local-workbook',
    meta: {
      id: `${input.sourceId}:${sheet}`,
      label: input.fileName,
      origin: input.fileName,
      sheet,
    },
    status,
    rows,
    diagnostics,
  };
}

function csvSnapshot(input: LocalWorkbookInput, bytes: Uint8Array): SourceSnapshot {
  const parsed = parseDelimitedText(decodeText(bytes), input.csvDelimiter);
  const sheet = 'CSV';
  const rows: SourceRow[] = parsed.rows.map((values, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells: SourceCell[] = [];

    for (let columnIndex = 0; columnIndex < parsed.columnCount; columnIndex += 1) {
      cells.push(createCell(sheet, rowNumber, columnIndex + 1, values[columnIndex] ?? null));
    }

    return { row: rowNumber, cells };
  });

  return createSnapshot(input, sheet, rows, []);
}

function normalizeWorkbookValue(value: unknown): SourceCell['value'] {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === undefined) {
    return null;
  }

  return String(value);
}

function workbookSnapshots(input: LocalWorkbookInput, bytes: Uint8Array): readonly SourceSnapshot[] {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: false,
    cellNF: false,
    cellText: true,
  });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const reference = worksheet?.['!ref'];

    if (worksheet === undefined || reference === undefined) {
      return createSnapshot(input, sheetName, [], []);
    }

    const range = XLSX.utils.decode_range(reference);
    const rowCount = range.e.r + 1;
    const columnCount = range.e.c + 1;
    const cellCount = rowCount * columnCount;

    if (cellCount > MAX_WORKBOOK_CELLS) {
      const diagnostic: Diagnostic = {
        code: 'DATA_WORKBOOK_RANGE_TOO_LARGE' satisfies LocalDataDiagnosticCode,
        message: 'La hoja excede el límite de celdas permitido para parsing local.',
        details: { sheet: sheetName, rowCount, columnCount, cellCount },
      };
      return createSnapshot(input, sheetName, [], [diagnostic], 'error');
    }

    const rows: SourceRow[] = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const cells: SourceCell[] = [];

      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const value = normalizeWorkbookValue(worksheet[address]?.v);
        cells.push(createCell(sheetName, rowNumber, columnIndex + 1, value));
      }

      rows.push({ row: rowNumber, cells });
    }

    return createSnapshot(input, sheetName, rows, []);
  });
}

export function loadLocalWorkbook(input: LocalWorkbookInput): LocalWorkbookLoadResult {
  const source = createSource(input);
  const extension = fileExtension(input.fileName);
  const bytes = toBytes(input.data);

  if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') {
    const diagnostic: Diagnostic = {
      code: 'DATA_UNSUPPORTED_FILE_TYPE' satisfies LocalDataDiagnosticCode,
      message: 'El archivo local no tiene un formato tabular soportado.',
      details: { fileName: input.fileName, extension },
    };
    return { source, snapshots: [], diagnostics: [diagnostic] };
  }

  try {
    const snapshots = extension === 'csv' ? [csvSnapshot(input, bytes)] : workbookSnapshots(input, bytes);

    if (snapshots.length === 0) {
      const diagnostic: Diagnostic = {
        code: 'DATA_WORKBOOK_EMPTY' satisfies LocalDataDiagnosticCode,
        message: 'El archivo no contiene hojas disponibles.',
        details: { fileName: input.fileName },
      };
      return { source, snapshots, diagnostics: [diagnostic] };
    }

    return {
      source,
      snapshots,
      diagnostics: snapshots.flatMap((snapshot) => snapshot.diagnostics),
    };
  } catch (error) {
    const diagnostic: Diagnostic = {
      code: 'DATA_PARSE_FAILED' satisfies LocalDataDiagnosticCode,
      message: 'No se pudo interpretar el archivo tabular local.',
      details: {
        fileName: input.fileName,
        error: error instanceof Error ? error.message : String(error),
      },
    };
    return { source, snapshots: [], diagnostics: [diagnostic] };
  }
}
