import type { Diagnostic } from '../../domain/contracts/core';
import type { Channel, ProductRef, ValueProvenance } from '../../domain/contracts/pricing';
import type { SourceCell, SourceLoc, SourceRow, SourceSnapshot } from '../../domain/contracts/source';
import { type PriceSlot, type PriceTier, priceFieldFromRaw } from '../../domain/pricing/slots';
import { normalizeCanonicalText, normalizeHeaderLiteral } from '../../utils/normalize/text';
import { columnIndexToLabel } from '../../utils/parsing/tabular';
import type { WorkbookSheetInfo, WorkbookSheetVisibility } from './local-workbook-source';

export type PricingMatrixDiagnosticCode =
  | 'unsupported-sheet-schema'
  | 'DATA_HEADER_ROW_AMBIGUOUS'
  | 'DATA_HEADER_METADATA_UNINTERPRETED'
  | 'DATA_GROUP_HEADER_MISSING'
  | 'DATA_GROUP_PAIR_HEADER_CONFLICT'
  | 'DATA_CHANNEL_HEADER_UNEXPECTED'
  | 'DATA_TIER_GROUP_ASYMMETRY'
  | 'DATA_EMINENT_BLOCK_ABSENT'
  | 'DATA_SECOND_IDENTITY_UNCLASSIFIED'
  | 'DATA_PRODUCT_CODE_MISMATCH'
  | 'DATA_PRODUCT_NAME_MISMATCH'
  | 'DATA_PRODUCT_NAME_MISSING'
  | 'DATA_UNCLASSIFIED_ROW_VALUES'
  | 'DATA_PRICE_INVALID';

export type PricingMatrixRowKind = 'product' | 'section' | 'empty';

export interface PricingMatrixIdentityColumns {
  readonly codeColumn: number;
  readonly nameColumn: number;
}

export interface PricingMatrixHeaderGroup {
  readonly tier: PriceTier;
  readonly groupRaw: string;
  readonly salonColumn: number;
  readonly deliColumn: number;
  readonly salonHeaderRaw: string | null;
  readonly deliHeaderRaw: string | null;
}

export interface PricingMatrixHeaderCell {
  readonly row: number;
  readonly column: number;
  readonly columnLabel: string;
  readonly raw: SourceCell['value'];
  readonly loc: SourceLoc;
}

export interface PricingMatrixMetadataRow {
  readonly row: number;
  readonly cells: readonly PricingMatrixHeaderCell[];
}

export interface PricingMatrixHeaderMetadata {
  readonly headerRow: number | null;
  readonly groupRow: number | null;
  readonly dataStartRow: number | null;
  readonly filterColumn: number | null;
  readonly normalIdentity: PricingMatrixIdentityColumns | null;
  readonly eminentIdentity: PricingMatrixIdentityColumns | null;
  readonly metadataRows: readonly PricingMatrixMetadataRow[];
  readonly row1: readonly PricingMatrixHeaderCell[];
  readonly normalGroups: readonly PricingMatrixHeaderGroup[];
  readonly eminentGroups: readonly PricingMatrixHeaderGroup[];
}

export interface PricingMatrixDimensions {
  readonly range: string | null;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly minRow: number | null;
  readonly maxRow: number | null;
  readonly minColumn: number | null;
  readonly maxColumn: number | null;
}

export interface PricingMatrixSheetMetadata {
  readonly name: string;
  readonly index: number | null;
  readonly visibility: WorkbookSheetVisibility | 'unknown';
  readonly dimensions: PricingMatrixDimensions;
  readonly headers: PricingMatrixHeaderMetadata;
  readonly warnings: readonly Diagnostic[];
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

export interface PricingMatrixSchemaDetection {
  readonly supported: boolean;
  readonly sheet: PricingMatrixSheetMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

export interface PricingMatrixAdapterOptions {
  readonly sheetInfo?: WorkbookSheetInfo;
}

export interface PricingMatrixAdapterResult {
  readonly supported: boolean;
  readonly rows: readonly PricingMatrixAdaptedRow[];
  readonly slots: readonly PriceSlot[];
  readonly headers: PricingMatrixHeaderMetadata;
  readonly sheet: PricingMatrixSheetMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

interface SourceBounds extends PricingMatrixDimensions {
  readonly minRowValue: number;
  readonly maxRowValue: number;
  readonly minColumnValue: number;
  readonly maxColumnValue: number;
}

interface IdentityRowCandidate {
  readonly row: number;
  readonly identities: readonly PricingMatrixIdentityColumns[];
  readonly channelPairCount: number;
  readonly hasFilter: boolean;
  readonly score: number;
}

interface GroupDetectionResult {
  readonly groups: readonly PricingMatrixHeaderGroup[];
  readonly diagnostics: readonly Diagnostic[];
  readonly unsafe: boolean;
}

function columnLabelToIndex(label: string): number | null {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-Z]+$/u.test(normalized)) {
    return null;
  }

  let value = 0;
  for (const char of normalized) {
    value = value * 26 + char.charCodeAt(0) - 64;
  }
  return value;
}

function cellColumn(cell: SourceCell, fallbackIndex: number): number {
  if (typeof cell.loc.column === 'number') {
    return cell.loc.column;
  }

  if (typeof cell.loc.column === 'string') {
    const parsed = columnLabelToIndex(cell.loc.column);
    if (parsed !== null) {
      return parsed;
    }
  }

  return columnLabelToIndex(cell.key) ?? fallbackIndex + 1;
}

function sourceBounds(snapshot: SourceSnapshot): SourceBounds {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = 0;

  for (const row of snapshot.rows) {
    minRow = Math.min(minRow, row.row);
    maxRow = Math.max(maxRow, row.row);
    row.cells.forEach((cell, index) => {
      const column = cellColumn(cell, index);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    });
  }

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn) || maxRow === 0 || maxColumn === 0) {
    return {
      range: null,
      rowCount: 0,
      columnCount: 0,
      minRow: null,
      maxRow: null,
      minColumn: null,
      maxColumn: null,
      minRowValue: 1,
      maxRowValue: 0,
      minColumnValue: 1,
      maxColumnValue: 0,
    };
  }

  return {
    range: `${columnIndexToLabel(minColumn)}${minRow}:${columnIndexToLabel(maxColumn)}${maxRow}`,
    rowCount: maxRow - minRow + 1,
    columnCount: maxColumn - minColumn + 1,
    minRow,
    maxRow,
    minColumn,
    maxColumn,
    minRowValue: minRow,
    maxRowValue: maxRow,
    minColumnValue: minColumn,
    maxColumnValue: maxColumn,
  };
}

function rowAt(snapshot: SourceSnapshot, rowNumber: number): SourceRow | undefined {
  return snapshot.rows.find((row) => row.row === rowNumber);
}

function cellAt(row: SourceRow | undefined, column: number): SourceCell | undefined {
  if (row === undefined) {
    return undefined;
  }

  const label = columnIndexToLabel(column);
  return row.cells.find((cell, index) => {
    const actualColumn = cellColumn(cell, index);
    return actualColumn === column || cell.key.toUpperCase() === label;
  });
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

function canonicalValue(value: SourceCell['value']): string {
  const text = textValue(value);
  return text === null ? '' : normalizeCanonicalText(text);
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
    row,
    column,
    columnLabel: columnIndexToLabel(column),
    raw: sourceCell?.value ?? null,
    loc: sourceCell?.loc ?? fallbackLoc(snapshot, row, column),
  };
}

function headerCellsForRow(
  snapshot: SourceSnapshot,
  row: number,
  bounds: SourceBounds,
): readonly PricingMatrixHeaderCell[] {
  if (bounds.maxColumnValue < bounds.minColumnValue) {
    return [];
  }

  const cells: PricingMatrixHeaderCell[] = [];
  for (let column = bounds.minColumnValue; column <= bounds.maxColumnValue; column += 1) {
    cells.push(headerCell(snapshot, row, column));
  }
  return cells;
}

function countChannelPairs(snapshot: SourceSnapshot, row: number, bounds: SourceBounds): number {
  let count = 0;
  for (let column = bounds.minColumnValue; column < bounds.maxColumnValue; column += 1) {
    if (
      canonicalValue(valueAt(snapshot, row, column)) === 'salon' &&
      canonicalValue(valueAt(snapshot, row, column + 1)) === 'deli'
    ) {
      count += 1;
      column += 1;
    }
  }
  return count;
}

function identityPairsForRow(
  snapshot: SourceSnapshot,
  row: number,
  bounds: SourceBounds,
): readonly PricingMatrixIdentityColumns[] {
  const pairs: PricingMatrixIdentityColumns[] = [];

  for (let column = bounds.minColumnValue; column < bounds.maxColumnValue; column += 1) {
    if (
      canonicalValue(valueAt(snapshot, row, column)) === 'codigo' &&
      canonicalValue(valueAt(snapshot, row, column + 1)) === 'nombre'
    ) {
      pairs.push({ codeColumn: column, nameColumn: column + 1 });
      column += 1;
    }
  }

  return pairs;
}

function findHeaderCandidates(snapshot: SourceSnapshot, bounds: SourceBounds): readonly IdentityRowCandidate[] {
  const candidates: IdentityRowCandidate[] = [];

  for (const row of snapshot.rows) {
    const identities = identityPairsForRow(snapshot, row.row, bounds);
    if (identities.length === 0) {
      continue;
    }

    const channelPairCount = countChannelPairs(snapshot, row.row, bounds);
    const hasFilter = Array.from(
      { length: Math.max(0, identities[0]!.codeColumn - bounds.minColumnValue) },
      (_, index) => bounds.minColumnValue + index,
    ).some((column) => canonicalValue(valueAt(snapshot, row.row, column)) === 'filtro');
    const score = identities.length * 1_000 + channelPairCount * 10 + (hasFilter ? 1 : 0);
    candidates.push({ row: row.row, identities, channelPairCount, hasFilter, score });
  }

  return candidates.sort((left, right) => right.score - left.score || left.row - right.row);
}

function findFilterColumn(
  snapshot: SourceSnapshot,
  headerRow: number,
  normalIdentity: PricingMatrixIdentityColumns,
  bounds: SourceBounds,
): number | null {
  for (let column = normalIdentity.codeColumn - 1; column >= bounds.minColumnValue; column -= 1) {
    if (canonicalValue(valueAt(snapshot, headerRow, column)) === 'filtro') {
      return column;
    }
  }
  return null;
}

function hasEminentLabel(
  snapshot: SourceSnapshot,
  groupRow: number,
  identity: PricingMatrixIdentityColumns,
  bounds: SourceBounds,
): boolean {
  const start = Math.max(bounds.minColumnValue, identity.codeColumn - 1);
  const end = Math.min(bounds.maxColumnValue, identity.nameColumn + 1);

  for (let column = start; column <= end; column += 1) {
    if (canonicalValue(valueAt(snapshot, groupRow, column)).includes('eminent')) {
      return true;
    }
  }
  return false;
}

function detectGroups(
  snapshot: SourceSnapshot,
  tier: PriceTier,
  headerRow: number,
  groupRow: number,
  startColumn: number,
  endColumn: number,
): GroupDetectionResult {
  const groups: PricingMatrixHeaderGroup[] = [];
  const diagnostics: Diagnostic[] = [];
  let unsafe = false;

  for (let column = startColumn; column <= endColumn; column += 1) {
    const current = canonicalValue(valueAt(snapshot, headerRow, column));
    const next = column < endColumn ? canonicalValue(valueAt(snapshot, headerRow, column + 1)) : '';

    if (current === 'salon' && next === 'deli') {
      const salonColumn = column;
      const deliColumn = column + 1;
      const firstGroup = textValue(valueAt(snapshot, groupRow, salonColumn));
      const secondGroup = textValue(valueAt(snapshot, groupRow, deliColumn));
      const groupRaw = firstGroup ?? secondGroup ?? '';
      const salonHeaderRaw = textValue(valueAt(snapshot, headerRow, salonColumn));
      const deliHeaderRaw = textValue(valueAt(snapshot, headerRow, deliColumn));

      if (groupRaw.length === 0) {
        unsafe = true;
        diagnostics.push({
          code: 'DATA_GROUP_HEADER_MISSING' satisfies PricingMatrixDiagnosticCode,
          message: 'Se detectó un par SALÓN/DELI sin encabezado de grupo en la fila superior.',
          details: { tier, salonColumn, deliColumn, groupRow },
        });
      }

      if (
        firstGroup !== null &&
        secondGroup !== null &&
        normalizeHeaderLiteral(firstGroup) !== normalizeHeaderLiteral(secondGroup)
      ) {
        unsafe = true;
        diagnostics.push({
          code: 'DATA_GROUP_PAIR_HEADER_CONFLICT' satisfies PricingMatrixDiagnosticCode,
          message: 'Las dos columnas del mismo par SALÓN/DELI declaran grupos diferentes.',
          details: { tier, salonColumn, deliColumn, firstGroup, secondGroup },
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
      column += 1;
      continue;
    }

    if (current === 'salon' || current === 'deli') {
      unsafe = true;
      diagnostics.push({
        code: 'DATA_CHANNEL_HEADER_UNEXPECTED' satisfies PricingMatrixDiagnosticCode,
        message: 'Se encontró un encabezado SALÓN/DELI que no forma un par contiguo SALÓN seguido por DELI.',
        details: { tier, column, raw: textValue(valueAt(snapshot, headerRow, column)) ?? '' },
      });
    }
  }

  return { groups, diagnostics, unsafe };
}

function addAsymmetryDiagnostic(
  normalGroups: readonly PricingMatrixHeaderGroup[],
  eminentGroups: readonly PricingMatrixHeaderGroup[],
  diagnostics: Diagnostic[],
): void {
  if (eminentGroups.length === 0) {
    return;
  }

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
      message: 'Los bloques NORMAL y ÉMINENT no tienen encabezados de grupo simétricos; no se aplica mapeo automático.',
      details: { normalOnly, eminentOnly },
    });
  }
}

function metadataRows(
  snapshot: SourceSnapshot,
  groupRow: number | null,
  bounds: SourceBounds,
): readonly PricingMatrixMetadataRow[] {
  if (groupRow === null) {
    return [];
  }

  return snapshot.rows
    .filter((row) => row.row < groupRow)
    .map((row) => ({ row: row.row, cells: headerCellsForRow(snapshot, row.row, bounds) }));
}

function buildHeaderMetadata(
  snapshot: SourceSnapshot,
  bounds: SourceBounds,
  headerRow: number | null,
  groupRow: number | null,
  filterColumn: number | null,
  normalIdentity: PricingMatrixIdentityColumns | null,
  eminentIdentity: PricingMatrixIdentityColumns | null,
  normalGroups: readonly PricingMatrixHeaderGroup[],
  eminentGroups: readonly PricingMatrixHeaderGroup[],
): PricingMatrixHeaderMetadata {
  return {
    headerRow,
    groupRow,
    dataStartRow: headerRow === null ? null : headerRow + 1,
    filterColumn,
    normalIdentity,
    eminentIdentity,
    metadataRows: metadataRows(snapshot, groupRow, bounds),
    row1: headerCellsForRow(snapshot, 1, bounds),
    normalGroups,
    eminentGroups,
  };
}

function buildSheetMetadata(
  snapshot: SourceSnapshot,
  bounds: SourceBounds,
  headers: PricingMatrixHeaderMetadata,
  diagnostics: readonly Diagnostic[],
  options: PricingMatrixAdapterOptions,
): PricingMatrixSheetMetadata {
  const sheetInfo = options.sheetInfo;
  const dimensions: PricingMatrixDimensions = {
    range: sheetInfo?.range ?? bounds.range,
    rowCount: sheetInfo?.rowCount ?? bounds.rowCount,
    columnCount: sheetInfo?.columnCount ?? bounds.columnCount,
    minRow: bounds.minRow,
    maxRow: bounds.maxRow,
    minColumn: bounds.minColumn,
    maxColumn: bounds.maxColumn,
  };

  return {
    name: sheetInfo?.name ?? snapshot.meta.sheet ?? 'CSV',
    index: sheetInfo?.index ?? null,
    visibility: sheetInfo?.visibility ?? 'unknown',
    dimensions,
    headers,
    warnings: diagnostics.filter((diagnostic) => diagnostic.code !== 'unsupported-sheet-schema'),
  };
}

export function detectPricingMatrixSchema(
  snapshot: SourceSnapshot,
  options: PricingMatrixAdapterOptions = {},
): PricingMatrixSchemaDetection {
  const diagnostics: Diagnostic[] = [];
  const bounds = sourceBounds(snapshot);
  const candidates = findHeaderCandidates(snapshot, bounds);
  const best = candidates[0];
  let supported = true;

  if (best === undefined || best.channelPairCount === 0) {
    supported = false;
    const headers = buildHeaderMetadata(snapshot, bounds, null, null, null, null, null, [], []);
    const unsupported: Diagnostic = {
      code: 'unsupported-sheet-schema' satisfies PricingMatrixDiagnosticCode,
      message: 'La hoja seleccionada no contiene una matriz de precios reconocible por encabezados Código/Nombre y pares SALÓN/DELI.',
      details: {
        detectedIdentityRows: candidates.map((candidate) => candidate.row),
        detectedIdentityCounts: candidates.map((candidate) => candidate.identities.length),
      },
    };
    diagnostics.push(unsupported);
    return {
      supported,
      sheet: buildSheetMetadata(snapshot, bounds, headers, diagnostics, options),
      diagnostics,
    };
  }

  const tied = candidates.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1) {
    supported = false;
    diagnostics.push({
      code: 'DATA_HEADER_ROW_AMBIGUOUS' satisfies PricingMatrixDiagnosticCode,
      message: 'Más de una fila presenta evidencia equivalente de cabecera de matriz; no se selecciona una silenciosamente.',
      details: { rows: tied.map((candidate) => candidate.row), score: best.score },
    });
  }

  const headerRow = best.row;
  const groupRow = headerRow - 1;
  const identities = [...best.identities].sort((left, right) => left.codeColumn - right.codeColumn);
  const normalIdentity = identities[0] ?? null;
  let eminentIdentity: PricingMatrixIdentityColumns | null = null;

  if (identities.length > 2) {
    supported = false;
    diagnostics.push({
      code: 'unsupported-sheet-schema' satisfies PricingMatrixDiagnosticCode,
      message: 'La hoja contiene más de dos bloques Código/Nombre y su semántica no puede determinarse de forma segura.',
      details: {
        headerRow,
        codeColumns: identities.map((identity) => identity.codeColumn),
        nameColumns: identities.map((identity) => identity.nameColumn),
      },
    });
  }

  if (identities.length >= 2) {
    const second = identities[1]!;
    if (hasEminentLabel(snapshot, groupRow, second, bounds)) {
      eminentIdentity = second;
    } else {
      supported = false;
      diagnostics.push({
        code: 'DATA_SECOND_IDENTITY_UNCLASSIFIED' satisfies PricingMatrixDiagnosticCode,
        message: 'Se detectó un segundo bloque Código/Nombre sin una etiqueta ÉMINENT inequívoca en la fila superior.',
        details: { headerRow, groupRow, codeColumn: second.codeColumn, nameColumn: second.nameColumn },
      });
    }
  }

  const filterColumn =
    normalIdentity === null ? null : findFilterColumn(snapshot, headerRow, normalIdentity, bounds);

  let normalGroups: readonly PricingMatrixHeaderGroup[] = [];
  let eminentGroups: readonly PricingMatrixHeaderGroup[] = [];

  if (normalIdentity !== null) {
    const secondIdentity = identities[1] ?? null;
    const normalEnd = secondIdentity === null ? bounds.maxColumnValue : secondIdentity.codeColumn - 1;
    const detectedNormal = detectGroups(
      snapshot,
      'NORMAL',
      headerRow,
      groupRow,
      normalIdentity.nameColumn + 1,
      normalEnd,
    );
    normalGroups = detectedNormal.groups;
    diagnostics.push(...detectedNormal.diagnostics);
    supported = supported && !detectedNormal.unsafe && normalGroups.length > 0;
  }

  if (eminentIdentity !== null) {
    const detectedEminent = detectGroups(
      snapshot,
      'EMINENT',
      headerRow,
      groupRow,
      eminentIdentity.nameColumn + 1,
      bounds.maxColumnValue,
    );
    eminentGroups = detectedEminent.groups;
    diagnostics.push(...detectedEminent.diagnostics);
    supported = supported && !detectedEminent.unsafe && eminentGroups.length > 0;
  } else if (identities.length === 1) {
    diagnostics.push({
      code: 'DATA_EMINENT_BLOCK_ABSENT' satisfies PricingMatrixDiagnosticCode,
      message: 'La hoja no contiene un segundo bloque ÉMINENT; se conserva como ausencia y no se deriva ningún valor.',
      details: { headerRow },
    });
  }

  addAsymmetryDiagnostic(normalGroups, eminentGroups, diagnostics);

  const metadata = metadataRows(snapshot, groupRow, bounds);
  const uninterpreted = metadata.flatMap((row) =>
    row.cells
      .filter((cell) => textValue(cell.raw) !== null)
      .map((cell) => `${cell.columnLabel}${cell.row}=${String(cell.raw)}`),
  );
  if (uninterpreted.length > 0) {
    diagnostics.push({
      code: 'DATA_HEADER_METADATA_UNINTERPRETED' satisfies PricingMatrixDiagnosticCode,
      message: 'Las filas anteriores a los encabezados contienen metadata cuya semántica no está demostrada y se preserva sin aplicarla.',
      details: { cells: uninterpreted },
    });
  }

  if (!supported && !diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-sheet-schema')) {
    diagnostics.push({
      code: 'unsupported-sheet-schema' satisfies PricingMatrixDiagnosticCode,
      message: 'La hoja seleccionada contiene evidencia parcial de matriz, pero el esquema no es suficientemente seguro para generar precios.',
      details: {
        headerRow,
        identityCount: identities.length,
        normalGroupCount: normalGroups.length,
        eminentGroupCount: eminentGroups.length,
      },
    });
  }

  const headers = buildHeaderMetadata(
    snapshot,
    bounds,
    headerRow,
    groupRow,
    filterColumn,
    normalIdentity,
    eminentIdentity,
    normalGroups,
    eminentGroups,
  );

  return {
    supported,
    sheet: buildSheetMetadata(snapshot, bounds, headers, diagnostics, options),
    diagnostics,
  };
}

function hasPriceValue(
  snapshot: SourceSnapshot,
  row: number,
  groups: readonly PricingMatrixHeaderGroup[],
): boolean {
  return groups.some(
    (group) =>
      textValue(valueAt(snapshot, row, group.salonColumn)) !== null ||
      textValue(valueAt(snapshot, row, group.deliColumn)) !== null,
  );
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
    const channel: Channel = column === group.salonColumn ? 'SALON' : 'DELI';
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

export function adaptPricingMatrix(
  snapshot: SourceSnapshot,
  options: PricingMatrixAdapterOptions = {},
): PricingMatrixAdapterResult {
  const detection = detectPricingMatrixSchema(snapshot, options);
  const headers = detection.sheet.headers;

  if (!detection.supported || headers.headerRow === null || headers.normalIdentity === null) {
    return {
      supported: false,
      rows: [],
      slots: [],
      headers,
      sheet: detection.sheet,
      diagnostics: detection.diagnostics,
    };
  }

  const diagnostics: Diagnostic[] = [...detection.diagnostics];
  const adaptedRows: PricingMatrixAdaptedRow[] = [];
  const allSlots: PriceSlot[] = [];
  const allGroups = [...headers.normalGroups, ...headers.eminentGroups];
  const normalIdentity = headers.normalIdentity;
  const eminentIdentity = headers.eminentIdentity;
  const filterColumn = headers.filterColumn;

  for (const sourceRow of snapshot.rows.filter((row) => row.row > headers.headerRow!)) {
    const rowDiagnostics: Diagnostic[] = [];
    const normalCode = textValue(cellAt(sourceRow, normalIdentity.codeColumn)?.value ?? null);
    const normalName = textValue(cellAt(sourceRow, normalIdentity.nameColumn)?.value ?? null);
    const eminentCode =
      eminentIdentity === null ? null : textValue(cellAt(sourceRow, eminentIdentity.codeColumn)?.value ?? null);
    const eminentName =
      eminentIdentity === null ? null : textValue(cellAt(sourceRow, eminentIdentity.nameColumn)?.value ?? null);
    const codeRaw = normalCode ?? eminentCode;
    const nameRaw = normalName ?? eminentName;
    const recordId = `${snapshot.meta.id}:r${sourceRow.row}`;
    const filterRaw = filterColumn === null ? null : cellAt(sourceRow, filterColumn)?.value ?? null;

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
        if (hasPriceValue(snapshot, sourceRow.row, allGroups)) {
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
    const slots = allGroups.flatMap((group) =>
      createSlotsForGroup(snapshot, sourceRow.row, recordId, product, group, rowDiagnostics),
    );

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
    supported: true,
    rows: adaptedRows,
    slots: allSlots,
    headers,
    sheet: {
      ...detection.sheet,
      warnings: diagnostics.filter((diagnostic) => diagnostic.code !== 'unsupported-sheet-schema'),
    },
    diagnostics,
  };
}

export const adaptObservedPricingMatrix = adaptPricingMatrix;
