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
  | 'DATA_WORKBOOK_RANGE_TOO_LARGE'
  | 'DATA_SHEET_SELECTION_REQUIRED'
  | 'DATA_SHEET_NOT_FOUND'
  | 'DATA_WORKBOOK_RANGE_INVALID';

export type WorkbookSheetVisibility = 'visible' | 'hidden' | 'veryHidden';

export interface WorkbookSheetInfo {
  readonly name: string;
  readonly index: number;
  readonly visibility: WorkbookSheetVisibility;
  readonly range: string | null;
  readonly rowCount: number;
  readonly columnCount: number;
}

export interface LocalWorkbookInput {
  readonly sourceId: string;
  readonly fileName: string;
  readonly data: ArrayBuffer | Uint8Array;
  readonly fileId?: string;
  readonly csvDelimiter?: string;
}

export type LocalWorkbookOpenStatus = 'ready' | 'sheet-selection-required' | 'error';
export type LocalSheetSelectionStatus = 'ready' | 'sheet-not-found' | 'error';

export interface LocalSheetSelectionResult {
  readonly status: LocalSheetSelectionStatus;
  readonly sheet?: WorkbookSheetInfo;
  readonly snapshot?: SourceSnapshot;
  readonly diagnostics: readonly Diagnostic[];
}

export interface LocalWorkbookOpenResult {
  readonly source: LocalWorkbookSource;
  readonly format: 'csv' | 'workbook';
  readonly status: LocalWorkbookOpenStatus;
  readonly sheets: readonly WorkbookSheetInfo[];
  readonly csvSnapshot?: SourceSnapshot;
  readonly diagnostics: readonly Diagnostic[];
  readonly selectSheet: (sheetName: string) => LocalSheetSelectionResult;
}

export type LocalWorkbookLoadResult = LocalWorkbookOpenResult;

const MAX_WORKBOOK_CELLS = 1_000_000;

interface SheetJsWorkbookMetadata {
  readonly Workbook?: {
    readonly Sheets?: readonly {
      readonly name?: string;
      readonly Hidden?: number;
    }[];
  };
}

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

function rangeDimensions(reference: string | undefined): {
  readonly range: string | null;
  readonly rowCount: number;
  readonly columnCount: number;
} {
  if (reference === undefined) {
    return { range: null, rowCount: 0, columnCount: 0 };
  }

  try {
    const range = XLSX.utils.decode_range(reference);
    return {
      range: reference,
      rowCount: range.e.r - range.s.r + 1,
      columnCount: range.e.c - range.s.c + 1,
    };
  } catch {
    return { range: reference, rowCount: 0, columnCount: 0 };
  }
}

function visibilityForSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  index: number,
): WorkbookSheetVisibility {
  const metadata = (workbook as unknown as SheetJsWorkbookMetadata).Workbook?.Sheets;
  const entry = metadata?.find((candidate) => candidate.name === sheetName) ?? metadata?.[index];

  if (entry?.Hidden === 2) {
    return 'veryHidden';
  }

  if (entry?.Hidden === 1) {
    return 'hidden';
  }

  return 'visible';
}

function enumerateWorkbookSheets(workbook: XLSX.WorkBook): readonly WorkbookSheetInfo[] {
  return workbook.SheetNames.map((name, index) => {
    const dimensions = rangeDimensions(workbook.Sheets[name]?.['!ref']);
    return {
      name,
      index,
      visibility: visibilityForSheet(workbook, name, index),
      ...dimensions,
    };
  });
}

function csvSheetInfo(snapshot: SourceSnapshot): WorkbookSheetInfo {
  const rowCount = snapshot.rows.length;
  const columnCount = snapshot.rows.reduce((maximum, row) => Math.max(maximum, row.cells.length), 0);
  const range =
    rowCount === 0 || columnCount === 0
      ? null
      : `A1:${columnIndexToLabel(columnCount)}${rowCount}`;

  return {
    name: 'CSV',
    index: 0,
    visibility: 'visible',
    range,
    rowCount,
    columnCount,
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

function parseWorkbookSheet(
  input: LocalWorkbookInput,
  workbook: XLSX.WorkBook,
  sheet: WorkbookSheetInfo,
): LocalSheetSelectionResult {
  const worksheet = workbook.Sheets[sheet.name];
  if (worksheet === undefined) {
    const diagnostic: Diagnostic = {
      code: 'DATA_SHEET_NOT_FOUND' satisfies LocalDataDiagnosticCode,
      message: 'La hoja seleccionada ya no está disponible en el workbook abierto.',
      details: { sheetName: sheet.name },
    };
    return { status: 'sheet-not-found', sheet, diagnostics: [diagnostic] };
  }

  const reference = worksheet['!ref'];
  if (reference === undefined) {
    return {
      status: 'ready',
      sheet,
      snapshot: createSnapshot(input, sheet.name, [], []),
      diagnostics: [],
    };
  }

  let range: ReturnType<typeof XLSX.utils.decode_range>;
  try {
    range = XLSX.utils.decode_range(reference);
  } catch {
    const diagnostic: Diagnostic = {
      code: 'DATA_WORKBOOK_RANGE_INVALID' satisfies LocalDataDiagnosticCode,
      message: 'La hoja seleccionada declara un rango que no puede interpretarse.',
      details: { sheetName: sheet.name, range: reference },
    };
    return { status: 'error', sheet, diagnostics: [diagnostic] };
  }

  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  const cellCount = rowCount * columnCount;

  if (cellCount > MAX_WORKBOOK_CELLS) {
    const diagnostic: Diagnostic = {
      code: 'DATA_WORKBOOK_RANGE_TOO_LARGE' satisfies LocalDataDiagnosticCode,
      message: 'La hoja excede el límite de celdas permitido para parsing local.',
      details: { sheet: sheet.name, rowCount, columnCount, cellCount },
    };
    return { status: 'error', sheet, diagnostics: [diagnostic] };
  }

  const rows: SourceRow[] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const cells: SourceCell[] = [];

    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const value = normalizeWorkbookValue(worksheet[address]?.v);
      cells.push(createCell(sheet.name, rowNumber, columnIndex + 1, value));
    }

    rows.push({ row: rowNumber, cells });
  }

  return {
    status: 'ready',
    sheet,
    snapshot: createSnapshot(input, sheet.name, rows, []),
    diagnostics: [],
  };
}

function openCsv(
  input: LocalWorkbookInput,
  source: LocalWorkbookSource,
  bytes: Uint8Array,
): LocalWorkbookOpenResult {
  const snapshot = csvSnapshot(input, bytes);
  const sheet = csvSheetInfo(snapshot);

  return {
    source,
    format: 'csv',
    status: 'ready',
    sheets: [sheet],
    csvSnapshot: snapshot,
    diagnostics: [],
    selectSheet: (sheetName) => {
      if (sheetName !== sheet.name) {
        const diagnostic: Diagnostic = {
          code: 'DATA_SHEET_NOT_FOUND' satisfies LocalDataDiagnosticCode,
          message: 'La tabla CSV sólo expone una hoja lógica llamada CSV.',
          details: { sheetName },
        };
        return { status: 'sheet-not-found', diagnostics: [diagnostic] };
      }

      return { status: 'ready', sheet, snapshot, diagnostics: [] };
    },
  };
}

function openWorkbook(
  input: LocalWorkbookInput,
  source: LocalWorkbookSource,
  bytes: Uint8Array,
): LocalWorkbookOpenResult {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: false,
    cellNF: false,
    cellText: true,
  });
  const sheets = enumerateWorkbookSheets(workbook);

  if (sheets.length === 0) {
    const diagnostic: Diagnostic = {
      code: 'DATA_WORKBOOK_EMPTY' satisfies LocalDataDiagnosticCode,
      message: 'El archivo no contiene hojas disponibles.',
      details: { fileName: input.fileName },
    };
    return {
      source,
      format: 'workbook',
      status: 'error',
      sheets,
      diagnostics: [diagnostic],
      selectSheet: () => ({ status: 'error', diagnostics: [diagnostic] }),
    };
  }

  const selectionDiagnostic: Diagnostic = {
    code: 'DATA_SHEET_SELECTION_REQUIRED' satisfies LocalDataDiagnosticCode,
    message: 'El workbook está abierto; se requiere seleccionar una hoja explícitamente antes de parsear datos.',
    details: { sheetCount: sheets.length },
  };

  return {
    source,
    format: 'workbook',
    status: 'sheet-selection-required',
    sheets,
    diagnostics: [selectionDiagnostic],
    selectSheet: (sheetName) => {
      const sheet = sheets.find((candidate) => candidate.name === sheetName);
      if (sheet === undefined) {
        const diagnostic: Diagnostic = {
          code: 'DATA_SHEET_NOT_FOUND' satisfies LocalDataDiagnosticCode,
          message: 'La hoja solicitada no existe en el workbook abierto.',
          details: { sheetName },
        };
        return { status: 'sheet-not-found', diagnostics: [diagnostic] };
      }

      return parseWorkbookSheet(input, workbook, sheet);
    },
  };
}

export function openLocalWorkbook(input: LocalWorkbookInput): LocalWorkbookOpenResult {
  const source = createSource(input);
  const extension = fileExtension(input.fileName);
  const bytes = toBytes(input.data);

  if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') {
    const diagnostic: Diagnostic = {
      code: 'DATA_UNSUPPORTED_FILE_TYPE' satisfies LocalDataDiagnosticCode,
      message: 'El archivo local no tiene un formato tabular soportado.',
      details: { fileName: input.fileName, extension },
    };
    return {
      source,
      format: 'workbook',
      status: 'error',
      sheets: [],
      diagnostics: [diagnostic],
      selectSheet: () => ({ status: 'error', diagnostics: [diagnostic] }),
    };
  }

  try {
    return extension === 'csv' ? openCsv(input, source, bytes) : openWorkbook(input, source, bytes);
  } catch (error) {
    const diagnostic: Diagnostic = {
      code: 'DATA_PARSE_FAILED' satisfies LocalDataDiagnosticCode,
      message: 'No se pudo abrir el archivo tabular local.',
      details: {
        fileName: input.fileName,
        error: error instanceof Error ? error.message : String(error),
      },
    };
    return {
      source,
      format: extension === 'csv' ? 'csv' : 'workbook',
      status: 'error',
      sheets: [],
      diagnostics: [diagnostic],
      selectSheet: () => ({ status: 'error', diagnostics: [diagnostic] }),
    };
  }
}

export const loadLocalWorkbook = openLocalWorkbook;
