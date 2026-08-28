import type { Diagnostic } from '../../domain/contracts/core';
import type { Channel, ProductRef, ValueProvenance } from '../../domain/contracts/pricing';
import type { SourceCell, SourceLoc, SourceRow, SourceSnapshot } from '../../domain/contracts/source';
import { type PriceSlot, type PriceTier, priceFieldFromRaw } from '../../domain/pricing/slots';
import { normalizeCanonicalText, normalizeHeaderLiteral } from '../../utils/normalize/text';
import { columnIndexToLabel } from '../../utils/parsing/tabular';

export type PricingMatrixDiagnosticCode =
  | 'DATA_ROW_COUNT_UNEXPECTED'
  | 'DATA_COLUMN_COUNT_UNEXPECTED'
  | 'DATA_UNKNOWN_COLUMN_48'
  | 'DATA_HEADER_METADATA_UNINTERPRETED'
  | 'DATA_GROUP_HEADER_MISSING'
  | 'DATA_GROUP_PAIR_HEADER_CONFLICT'
  | 'DATA_CHANNEL_HEADER_UNEXPECTED'
  | 'DATA_TIER_GROUP_ASYMMETRY'
  | 'DATA_PRODUCT_CODE_MISMATCH'
  | 'DATA_PRODUCT_NAME_MISMATCH'
  | 'DATA_PRODUCT_NAME_MISSING'
  | 'DATA_UNCLASSIFIED_ROW_VALUES'
  | 'DATA_PRICE_INVALID';

export type PricingMatrixRowKind = 'product' | 'section' | 'empty';

export interface PricingMatrixHeaderGroup {
  readonly tier: PriceTier;
  readonly groupRaw: string;
  readonly salonColumn: number;
  readonly deliColumn: number;
  readonly salonHeaderRaw: string | null;
  readonly deliHeaderRaw: string | null;
}

export interface PricingMatrixHeaderCell {
  readonly column: number;
  readonly columnLabel: string;
  readonly raw: SourceCell['value'];
  readonly loc: SourceLoc;
}

export interface PricingMatrixHeaderMetadata {
  readonly row1: readonly PricingMatrixHeaderCell[];
  readonly normalGroups: readonly PricingMatrixHeaderGroup[];
  readonly eminentGroups: readonly PricingMatrixHeaderGroup[];
  readonly unknownColumn48: PricingMatrixHeaderCell;
}

export interface PricingMatrixAdaptedRow {
  readonly kind: PricingMatrixRowKind;
  readonly sourceRow: number;
  readonly sourceRecordId: string;
  readonly filterRaw: SourceCell['value'];
  readonly product?: ProductRef;
  readonly sectionNameRaw?: string;
  readonly slots: readonly PriceSlot[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface PricingMatrixAdapterResult {
  readonly rows: readonly PricingMatrixAdaptedRow[];
  readonly slots: readonly PriceSlot[];
  readonly headers: PricingMatrixHeaderMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

const EXPECTED_ROWS = 86;
const EXPECTED_COLUMNS = 92;
const NORMAL_START = 4;
const NORMAL_END = 47;
const EMINENT_START = 51;
const EMINENT_END = 92;

function rowAt(snapshot: SourceSnapshot, rowNumber: number): SourceRow | undefined {
  return snapshot.rows.find((row) => row.row === rowNumber);
}

function cellAt(row: SourceRow | undefined, column: number): SourceCell | undefined {
  if (row === undefined) {
    return undefined;
  }

  const label = columnIndexToLabel(column);
  return (
    row.cells.find(
      (cell) =>
        cell.loc.column === column || cell.loc.column === label || cell.key.toUpperCase() === label,
    ) ?? row.cells[column - 1]
  );
}

function fallbackLoc(snapshot: SourceSnapshot, row: number, column: number): SourceLoc {
  const label = columnIndexToLabel(column);
  return {
    ...(snapshot.meta.sheet === undefined ? {} : { sheet: snapshot.meta.sheet }),
    row,
    column,
    cell: `${label}${row}`,
  };
}

function valueAt(snapshot: SourceSnapshot, row: number, column: number): SourceCell['value'] {
  return cellAt(rowAt(snapshot, row), column)?.value ?? null;
}

function textValue(value: SourceCell['value']): string | null {
  if (value === null) {
    return null;
  }

  const text = String(value);
  return text.trim().length === 0 ? null : text;
}

function provenanceRaw(value: SourceCell['value']): string | number | null {
  return typeof value === 'boolean' ? String(value) : value;
}

function provenanceFor(
  snapshot: SourceSnapshot,
  row: number,
  column: number,
  raw: SourceCell['value'],
): ValueProvenance {
  return {
    sourceId: snapshot.meta.id,
    sourceKind: snapshot.kind,
    loc: cellAt(rowAt(snapshot, row), column)?.loc ?? fallbackLoc(snapshot, row, column),
    raw: provenanceRaw(raw),
  };
}

function headerCell(snapshot: SourceSnapshot, row: number, column: number): PricingMatrixHeaderCell {
  const sourceCell = cellAt(rowAt(snapshot, row), column);
  return {
    column,
    columnLabel: columnIndexToLabel(column),
    raw: sourceCell?.value ?? null,
    loc: sourceCell?.loc ?? fallbackLoc(snapshot, row, column),
  };
}

function maximumColumn(snapshot: SourceSnapshot): number {
  let maximum = 0;

  for (const row of snapshot.rows) {
    for (const cell of row.cells) {
      if (typeof cell.loc.column === 'number') {
        maximum = Math.max(maximum, cell.loc.column);
      }
    }
    maximum = Math.max(maximum, row.cells.length);
  }

  return maximum;
}

function expectedChannel(column: number, pairStart: number): Channel {
  return column === pairStart ? 'SALON' : 'DELI';
}

function channelMatches(raw: string | null, channel: Channel): boolean {
  if (raw === null) {
    return false;
  }

  const canonical = normalizeCanonicalText(raw);
  return channel === 'SALON' ? canonical === 'salon' : canonical === 'deli';
}

function buildHeaderGroups(
  snapshot: SourceSnapshot,
  tier: PriceTier,
  startColumn: number,
  endColumn: number,
  diagnostics: Diagnostic[],
): PricingMatrixHeaderGroup[] {
  const groups: PricingMatrixHeaderGroup[] = [];

  for (let pairStart = startColumn; pairStart <= endColumn; pairStart += 2) {
    const salonColumn = pairStart;
    const deliColumn = pairStart + 1;
    const firstGroup = textValue(valueAt(snapshot, 2, salonColumn));
    const secondGroup = textValue(valueAt(snapshot, 2, deliColumn));
    const groupRaw = firstGroup ?? secondGroup ?? '';
    const salonHeaderRaw = textValue(valueAt(snapshot, 3, salonColumn));
    const deliHeaderRaw = textValue(valueAt(snapshot, 3, deliColumn));

    if (groupRaw.length === 0) {
      diagnostics.push({
        code: 'DATA_GROUP_HEADER_MISSING' satisfies PricingMatrixDiagnosticCode,
        message: 'Falta el encabezado de grupo para un par de columnas de precio.',
        details: { tier, salonColumn, deliColumn },
      });
    }

    if (
      firstGroup !== null &&
      secondGroup !== null &&
      normalizeHeaderLiteral(firstGroup) !== normalizeHeaderLiteral(secondGroup)
    ) {
      diagnostics.push({
        code: 'DATA_GROUP_PAIR_HEADER_CONFLICT' satisfies PricingMatrixDiagnosticCode,
        message: 'Las dos columnas del mismo par declaran grupos diferentes.',
        details: { tier, salonColumn, deliColumn, firstGroup, secondGroup },
      });
    }

    if (!channelMatches(salonHeaderRaw, 'SALON')) {
      diagnostics.push({
        code: 'DATA_CHANNEL_HEADER_UNEXPECTED' satisfies PricingMatrixDiagnosticCode,
        message: 'El encabezado de canal no coincide con SALÓN en la posición esperada.',
        details: { tier, column: salonColumn, raw: salonHeaderRaw ?? '' },
      });
    }

    if (!channelMatches(deliHeaderRaw, 'DELI')) {
      diagnostics.push({
        code: 'DATA_CHANNEL_HEADER_UNEXPECTED' satisfies PricingMatrixDiagnosticCode,
        message: 'El encabezado de canal no coincide con DELI en la posición esperada.',
        details: { tier, column: deliColumn, raw: deliHeaderRaw ?? '' },
      });
    }

    groups.push({
      tier,
      groupRaw,
      salonColumn,
      deliColumn,
      salonHeaderRaw,
      deliHeaderRaw,
    });
  }

  return groups;
}

function addAsymmetryDiagnostic(
  normalGroups: readonly PricingMatrixHeaderGroup[],
  eminentGroups: readonly PricingMatrixHeaderGroup[],
  diagnostics: Diagnostic[],
): void {
  const normalKeys = new Set(
    normalGroups.filter((group) => group.groupRaw.length > 0).map((group) => normalizeHeaderLiteral(group.groupRaw)),
  );
  const eminentKeys = new Set(
    eminentGroups.filter((group) => group.groupRaw.length > 0).map((group) => normalizeHeaderLiteral(group.groupRaw)),
  );
  const normalOnly = normalGroups
    .filter((group) => group.groupRaw.length > 0 && !eminentKeys.has(normalizeHeaderLiteral(group.groupRaw)))
    .map((group) => group.groupRaw);
  const eminentOnly = eminentGroups
    .filter((group) => group.groupRaw.length > 0 && !normalKeys.has(normalizeHeaderLiteral(group.groupRaw)))
    .map((group) => group.groupRaw);

  if (normalOnly.length > 0 || eminentOnly.length > 0) {
    diagnostics.push({
      code: 'DATA_TIER_GROUP_ASYMMETRY' satisfies PricingMatrixDiagnosticCode,
      message: 'Los bloques NORMAL y ÉMINENT no tienen encabezados de grupo simétricos.',
      details: { normalOnly, eminentOnly },
    });
  }
}

function hasPriceValue(snapshot: SourceSnapshot, row: number): boolean {
  for (let column = NORMAL_START; column <= NORMAL_END; column += 1) {
    if (textValue(valueAt(snapshot, row, column)) !== null) {
      return true;
    }
  }

  for (let column = EMINENT_START; column <= EMINENT_END; column += 1) {
    if (textValue(valueAt(snapshot, row, column)) !== null) {
      return true;
    }
  }

  return false;
}

function createSlotsForGroup(
  snapshot: SourceSnapshot,
  row: number,
  recordId: string,
  product: ProductRef,
  group: PricingMatrixHeaderGroup,
  diagnostics: Diagnostic[],
): PriceSlot[] {
  const slots: PriceSlot[] = [];

  for (const column of [group.salonColumn, group.deliColumn]) {
    const channel = expectedChannel(column, group.salonColumn);
    const raw = valueAt(snapshot, row, column);
    const provenance = provenanceFor(snapshot, row, column, raw);
    const field = priceFieldFromRaw(raw, provenance);

    if (field.state === 'unknown' && field.reason === 'invalid') {
      diagnostics.push({
        code: 'DATA_PRICE_INVALID' satisfies PricingMatrixDiagnosticCode,
        message: 'La celda de precio contiene un valor no interpretable como importe.',
        details: {
          row,
          column,
          tier: group.tier,
          groupRaw: group.groupRaw,
          channel,
          raw: raw === null ? '' : String(raw),
        },
      });
    }

    slots.push({
      id: `${recordId}:${group.tier}:${column}`,
      sourceRecordId: recordId,
      sourceRow: row,
      product,
      tier: group.tier,
      groupRaw: group.groupRaw,
      channel,
      headerRaw: group.groupRaw.length === 0 ? null : group.groupRaw,
      channelHeaderRaw: channel === 'SALON' ? group.salonHeaderRaw : group.deliHeaderRaw,
      field,
    });
  }

  return slots;
}

export function adaptObservedPricingMatrix(snapshot: SourceSnapshot): PricingMatrixAdapterResult {
  const diagnostics: Diagnostic[] = [];
  const rowCount = snapshot.rows.length;
  const columnCount = maximumColumn(snapshot);

  if (rowCount !== EXPECTED_ROWS) {
    diagnostics.push({
      code: 'DATA_ROW_COUNT_UNEXPECTED' satisfies PricingMatrixDiagnosticCode,
      message: 'La cantidad de filas difiere de la matriz observada en discovery.',
      details: { expected: EXPECTED_ROWS, actual: rowCount },
    });
  }

  if (columnCount !== EXPECTED_COLUMNS) {
    diagnostics.push({
      code: 'DATA_COLUMN_COUNT_UNEXPECTED' satisfies PricingMatrixDiagnosticCode,
      message: 'La cantidad de columnas difiere de la matriz observada en discovery.',
      details: { expected: EXPECTED_COLUMNS, actual: columnCount },
    });
  }

  const row1 = Array.from({ length: EXPECTED_COLUMNS }, (_, index) => headerCell(snapshot, 1, index + 1));
  const uninterpreted = row1.filter((cell) => cell.column >= 4 && textValue(cell.raw) !== null);
  if (uninterpreted.length > 0) {
    diagnostics.push({
      code: 'DATA_HEADER_METADATA_UNINTERPRETED' satisfies PricingMatrixDiagnosticCode,
      message: 'La primera fila contiene metadata cuya semántica no está demostrada y se preserva sin aplicarla.',
      details: {
        columns: uninterpreted.map((cell) => cell.column),
        values: uninterpreted.map((cell) => cell.raw),
      },
    });
  }

  const unknownColumn48 = headerCell(snapshot, 1, 48);
  diagnostics.push({
    code: 'DATA_UNKNOWN_COLUMN_48' satisfies PricingMatrixDiagnosticCode,
    message: 'La columna 48 tiene un rol no demostrado y no participa del pricing.',
    details: { column: 48, raw: unknownColumn48.raw },
  });

  const normalGroups = buildHeaderGroups(snapshot, 'NORMAL', NORMAL_START, NORMAL_END, diagnostics);
  const eminentGroups = buildHeaderGroups(snapshot, 'EMINENT', EMINENT_START, EMINENT_END, diagnostics);
  addAsymmetryDiagnostic(normalGroups, eminentGroups, diagnostics);

  const adaptedRows: PricingMatrixAdaptedRow[] = [];
  const allSlots: PriceSlot[] = [];

  for (const sourceRow of snapshot.rows.filter((row) => row.row >= 4)) {
    const rowDiagnostics: Diagnostic[] = [];
    const normalCode = textValue(cellAt(sourceRow, 2)?.value ?? null);
    const normalName = textValue(cellAt(sourceRow, 3)?.value ?? null);
    const eminentCode = textValue(cellAt(sourceRow, 49)?.value ?? null);
    const eminentName = textValue(cellAt(sourceRow, 50)?.value ?? null);
    const codeRaw = normalCode ?? eminentCode;
    const nameRaw = normalName ?? eminentName;
    const recordId = `${snapshot.meta.id}:r${sourceRow.row}`;
    const filterRaw = cellAt(sourceRow, 1)?.value ?? null;

    if (
      normalCode !== null &&
      eminentCode !== null &&
      normalizeHeaderLiteral(normalCode) !== normalizeHeaderLiteral(eminentCode)
    ) {
      rowDiagnostics.push({
        code: 'DATA_PRODUCT_CODE_MISMATCH' satisfies PricingMatrixDiagnosticCode,
        message: 'Los códigos de producto de NORMAL y ÉMINENT difieren en la misma fila.',
        details: { row: sourceRow.row, normalCode, eminentCode },
      });
    }

    if (
      normalName !== null &&
      eminentName !== null &&
      normalizeHeaderLiteral(normalName) !== normalizeHeaderLiteral(eminentName)
    ) {
      rowDiagnostics.push({
        code: 'DATA_PRODUCT_NAME_MISMATCH' satisfies PricingMatrixDiagnosticCode,
        message: 'Los nombres de producto de NORMAL y ÉMINENT difieren en la misma fila.',
        details: { row: sourceRow.row, normalName, eminentName },
      });
    }

    if (codeRaw === null) {
      if (nameRaw !== null) {
        adaptedRows.push({
          kind: 'section',
          sourceRow: sourceRow.row,
          sourceRecordId: recordId,
          filterRaw,
          sectionNameRaw: nameRaw,
          slots: [],
          diagnostics: rowDiagnostics,
        });
      } else {
        if (hasPriceValue(snapshot, sourceRow.row)) {
          rowDiagnostics.push({
            code: 'DATA_UNCLASSIFIED_ROW_VALUES' satisfies PricingMatrixDiagnosticCode,
            message: 'La fila tiene valores de precio pero no tiene Código ni Nombre clasificable.',
            details: { row: sourceRow.row },
          });
        }

        adaptedRows.push({
          kind: 'empty',
          sourceRow: sourceRow.row,
          sourceRecordId: recordId,
          filterRaw,
          slots: [],
          diagnostics: rowDiagnostics,
        });
      }

      diagnostics.push(...rowDiagnostics);
      continue;
    }

    if (nameRaw === null) {
      rowDiagnostics.push({
        code: 'DATA_PRODUCT_NAME_MISSING' satisfies PricingMatrixDiagnosticCode,
        message: 'La fila tiene Código pero no tiene Nombre de producto.',
        details: { row: sourceRow.row, codeRaw },
      });
    }

    const product: ProductRef = { codeRaw, nameRaw: nameRaw ?? '' };
    const slots = [
      ...normalGroups.flatMap((group) =>
        createSlotsForGroup(snapshot, sourceRow.row, recordId, product, group, rowDiagnostics),
      ),
      ...eminentGroups.flatMap((group) =>
        createSlotsForGroup(snapshot, sourceRow.row, recordId, product, group, rowDiagnostics),
      ),
    ];

    allSlots.push(...slots);
    adaptedRows.push({
      kind: 'product',
      sourceRow: sourceRow.row,
      sourceRecordId: recordId,
      filterRaw,
      product,
      slots,
      diagnostics: rowDiagnostics,
    });
    diagnostics.push(...rowDiagnostics);
  }

  return {
    rows: adaptedRows,
    slots: allSlots,
    headers: {
      row1,
      normalGroups,
      eminentGroups,
      unknownColumn48,
    },
    diagnostics,
  };
}
