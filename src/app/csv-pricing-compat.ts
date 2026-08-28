import type { Diagnostic } from '../domain/contracts/core';
import type { Channel, ProductRef, ValueProvenance } from '../domain/contracts/pricing';
import type { SourceCell, SourceLoc, SourceRow, SourceSnapshot } from '../domain/contracts/source';
import { type PriceSlot, type PriceTier, priceFieldFromRaw } from '../domain/pricing/slots';
import type { PricingMatrixAdaptedRow } from '../features/data-source';
import { normalizeCanonicalText } from '../utils/normalize/text';
import { columnIndexToLabel } from '../utils/parsing/tabular';

export interface CsvPricingCompatibilityResult {
  readonly supported: boolean;
  readonly rows: readonly PricingMatrixAdaptedRow[];
  readonly diagnostics: readonly Diagnostic[];
  readonly normalGroupCount: number;
  readonly eminentGroupCount?: number;
}

interface IdentityPair {
  readonly codeColumn: number;
  readonly nameColumn: number;
}

interface PricePair {
  readonly identity: IdentityPair;
  readonly salonColumn: number;
  readonly deliColumn: number;
  readonly groupRaw: string;
  readonly salonHeaderRaw: string | null;
  readonly deliHeaderRaw: string | null;
}

function textValue(value: SourceCell['value']): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function cellAt(row: SourceRow | undefined, column: number): SourceCell | undefined {
  if (row === undefined) return undefined;
  const label = columnIndexToLabel(column);
  return row.cells.find((cell) => cell.loc.column === column || cell.loc.column === label || cell.key.toUpperCase() === label)
    ?? row.cells[column - 1];
}

function valueAt(snapshot: SourceSnapshot, row: number, column: number): SourceCell['value'] {
  return cellAt(snapshot.rows.find((candidate) => candidate.row === row), column)?.value ?? null;
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

function provenanceFor(snapshot: SourceSnapshot, row: number, column: number, raw: SourceCell['value']): ValueProvenance {
  const sourceCell = cellAt(snapshot.rows.find((candidate) => candidate.row === row), column);
  return {
    sourceId: snapshot.meta.id,
    sourceKind: snapshot.kind,
    loc: sourceCell?.loc ?? fallbackLoc(snapshot, row, column),
    raw: typeof raw === 'boolean' ? String(raw) : raw,
  };
}

function isChannel(value: SourceCell['value'], channel: Channel): boolean {
  const text = textValue(value);
  if (text === null) return false;
  const canonical = normalizeCanonicalText(text);
  return channel === 'SALON' ? canonical === 'salon' : canonical === 'deli';
}

function maximumColumn(snapshot: SourceSnapshot): number {
  return snapshot.rows.reduce((maximum, row) => Math.max(maximum, row.cells.length), 0);
}

function channelPairs(snapshot: SourceSnapshot): { readonly headerRow: number; readonly starts: readonly number[] } | null {
  const maxColumn = maximumColumn(snapshot);
  let best: { readonly headerRow: number; readonly starts: readonly number[] } | null = null;

  for (const row of snapshot.rows) {
    const starts: number[] = [];
    for (let column = 1; column < maxColumn; column += 1) {
      if (isChannel(valueAt(snapshot, row.row, column), 'SALON') && isChannel(valueAt(snapshot, row.row, column + 1), 'DELI')) {
        starts.push(column);
        column += 1;
      }
    }
    if (starts.length > 0 && (best === null || starts.length > best.starts.length)) {
      best = { headerRow: row.row, starts };
    }
  }

  return best;
}

function looksLikeName(value: SourceCell['value']): boolean {
  const text = textValue(value);
  if (text === null) return false;
  return Number.isNaN(Number(text.replace(',', '.')));
}

function identityBefore(pairStart: number, dataRows: readonly SourceRow[]): IdentityPair | null {
  const evidenceRows = dataRows.slice(0, 12);
  for (let codeColumn = pairStart - 2; codeColumn >= 1; codeColumn -= 1) {
    const nameColumn = codeColumn + 1;
    const evidence = evidenceRows.filter((row) =>
      textValue(cellAt(row, codeColumn)?.value ?? null) !== null
      && looksLikeName(cellAt(row, nameColumn)?.value ?? null),
    );
    const required = Math.min(2, Math.max(1, evidenceRows.length));
    if (evidence.length >= required) return { codeColumn, nameColumn };
  }
  return null;
}

function sameIdentity(left: IdentityPair, right: IdentityPair): boolean {
  return left.codeColumn === right.codeColumn && left.nameColumn === right.nameColumn;
}

function createSlots(
  snapshot: SourceSnapshot,
  sourceRow: SourceRow,
  recordId: string,
  product: ProductRef,
  tier: PriceTier,
  pair: PricePair,
  diagnostics: Diagnostic[],
): readonly PriceSlot[] {
  return ([['SALON', pair.salonColumn, pair.salonHeaderRaw], ['DELI', pair.deliColumn, pair.deliHeaderRaw]] as const).map(
    ([channel, column, channelHeaderRaw]) => {
      const raw = cellAt(sourceRow, column)?.value ?? null;
      const field = priceFieldFromRaw(raw, provenanceFor(snapshot, sourceRow.row, column, raw));
      if (field.state === 'unknown' && field.reason === 'invalid') {
        diagnostics.push({
          code: 'CSV_PRICE_INVALID',
          message: 'Una celda de precio del CSV no puede interpretarse como importe.',
          details: { row: sourceRow.row, column, tier, channel },
        });
      }
      return {
        id: `${recordId}:${tier}:${column}`,
        sourceRecordId: recordId,
        sourceRow: sourceRow.row,
        product,
        tier,
        groupRaw: pair.groupRaw,
        channel,
        headerRaw: pair.groupRaw.length === 0 ? null : pair.groupRaw,
        channelHeaderRaw,
        field,
      };
    },
  );
}

export function adaptCsvPricingCompatibility(snapshot: SourceSnapshot): CsvPricingCompatibilityResult {
  const diagnostics: Diagnostic[] = [];
  const detected = channelPairs(snapshot);
  if (detected === null) {
    return {
      supported: false,
      rows: [],
      diagnostics: [{ code: 'CSV_SCHEMA_UNSUPPORTED', message: 'El CSV no contiene pares SALÓN/DELI reconocibles.' }],
      normalGroupCount: 0,
    };
  }

  const dataRows = snapshot.rows.filter((row) => row.row > detected.headerRow);
  const groupRow = detected.headerRow - 1;
  const pairs: PricePair[] = [];
  for (const start of detected.starts) {
    const identity = identityBefore(start, dataRows);
    if (identity === null) continue;
    const firstGroup = textValue(valueAt(snapshot, groupRow, start));
    const secondGroup = textValue(valueAt(snapshot, groupRow, start + 1));
    pairs.push({
      identity,
      salonColumn: start,
      deliColumn: start + 1,
      groupRaw: firstGroup ?? secondGroup ?? '',
      salonHeaderRaw: textValue(valueAt(snapshot, detected.headerRow, start)),
      deliHeaderRaw: textValue(valueAt(snapshot, detected.headerRow, start + 1)),
    });
  }

  const identities: IdentityPair[] = [];
  for (const pair of pairs) {
    if (!identities.some((identity) => sameIdentity(identity, pair.identity))) identities.push(pair.identity);
  }
  if (identities.length === 0 || identities.length > 2) {
    return {
      supported: false,
      rows: [],
      diagnostics: [{
        code: 'CSV_SCHEMA_UNSUPPORTED',
        message: 'El CSV no permite identificar de forma inequívoca uno o dos bloques de Código/Nombre con precios.',
        details: { identityBlockCount: identities.length },
      }],
      normalGroupCount: 0,
    };
  }

  const primary = identities[0]!;
  const secondary = identities[1];
  const normalPairs = pairs.filter((pair) => sameIdentity(pair.identity, primary));
  const eminentPairs = secondary === undefined ? [] : pairs.filter((pair) => sameIdentity(pair.identity, secondary));
  if (normalPairs.length === 0) {
    return {
      supported: false,
      rows: [],
      diagnostics: [{ code: 'CSV_SCHEMA_UNSUPPORTED', message: 'El CSV no contiene grupos de precio NORMAL utilizables.' }],
      normalGroupCount: 0,
    };
  }

  const adaptedRows: PricingMatrixAdaptedRow[] = [];
  for (const row of dataRows) {
    const rowDiagnostics: Diagnostic[] = [];
    const normalCode = textValue(cellAt(row, primary.codeColumn)?.value ?? null);
    const normalName = textValue(cellAt(row, primary.nameColumn)?.value ?? null);
    const eminentCode = secondary === undefined ? null : textValue(cellAt(row, secondary.codeColumn)?.value ?? null);
    const eminentName = secondary === undefined ? null : textValue(cellAt(row, secondary.nameColumn)?.value ?? null);
    const codeRaw = normalCode ?? eminentCode;
    const nameRaw = normalName ?? eminentName;
    const recordId = `${snapshot.meta.id}:r${row.row}`;
    const filterRaw = cellAt(row, 1)?.value ?? null;

    if (normalCode !== null && eminentCode !== null && normalizeCanonicalText(normalCode) !== normalizeCanonicalText(eminentCode)) {
      rowDiagnostics.push({ code: 'CSV_PRODUCT_CODE_MISMATCH', message: 'Los códigos NORMAL y ÉMINENT difieren en la misma fila.', details: { row: row.row } });
    }
    if (normalName !== null && eminentName !== null && normalizeCanonicalText(normalName) !== normalizeCanonicalText(eminentName)) {
      rowDiagnostics.push({ code: 'CSV_PRODUCT_NAME_MISMATCH', message: 'Los nombres NORMAL y ÉMINENT difieren en la misma fila.', details: { row: row.row } });
    }

    if (codeRaw === null) {
      adaptedRows.push(nameRaw === null
        ? { kind: 'empty', sourceRow: row.row, sourceRecordId: recordId, filterRaw, slots: [], diagnostics: rowDiagnostics }
        : { kind: 'section', sourceRow: row.row, sourceRecordId: recordId, filterRaw, sectionNameRaw: nameRaw, slots: [], diagnostics: rowDiagnostics });
      diagnostics.push(...rowDiagnostics);
      continue;
    }

    const product: ProductRef = { codeRaw, nameRaw: nameRaw ?? '' };
    const slots = [
      ...normalPairs.flatMap((pair) => createSlots(snapshot, row, recordId, product, 'NORMAL', pair, rowDiagnostics)),
      ...eminentPairs.flatMap((pair) => createSlots(snapshot, row, recordId, product, 'EMINENT', pair, rowDiagnostics)),
    ];
    adaptedRows.push({
      kind: 'product',
      sourceRow: row.row,
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
    diagnostics,
    normalGroupCount: normalPairs.length,
    ...(eminentPairs.length === 0 ? {} : { eminentGroupCount: eminentPairs.length }),
  };
}
