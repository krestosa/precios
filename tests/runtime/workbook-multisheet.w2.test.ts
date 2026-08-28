import { describe, expect, it } from 'vitest';
import {
  adaptPricingMatrix,
  detectPricingMatrixSchema,
  loadLocalWorkbook,
  openLocalWorkbook,
  type LocalSheetSelectionResult,
} from '../../src/features/data-source';
import {
  AMBIGUOUS_SECOND_BLOCK_SHEET_NAME,
  AUXILIARY_SHEET_NAME,
  HIDDEN_SHEET_NAMES,
  MATRIX_SHEET_SPECS,
  SYNTHETIC_SHEET_ORDER,
  createGrowingWorkbookBytes,
  expectedGroupNames,
} from '../fixtures/workbook/growing-workbook.fixture';

function openFixture() {
  return openLocalWorkbook({
    sourceId: 'qa:growing-workbook',
    fileName: 'precios-crecientes.xlsx',
    data: createGrowingWorkbookBytes(),
  });
}

function readySelection(result: LocalSheetSelectionResult) {
  expect(result.status).toBe('ready');
  expect(result.sheet).toBeDefined();
  expect(result.snapshot).toBeDefined();
  if (!result.sheet || !result.snapshot) throw new Error('La selección no produjo hoja y snapshot.');
  return { sheet: result.sheet, snapshot: result.snapshot };
}

function knownAmounts(adapted: ReturnType<typeof adaptPricingMatrix>): readonly number[] {
  return adapted.slots.flatMap((slot) => slot.field.state === 'known' ? [slot.field.amount] : []);
}

describe('W2 workbook multi-hoja y esquema creciente', () => {
  it('abre 59 hojas en orden, preserva visibilidad y exige selección explícita', () => {
    const opened = openFixture();

    expect(opened.format).toBe('workbook');
    expect(opened.status).toBe('sheet-selection-required');
    expect(opened.sheets).toHaveLength(59);
    expect(opened.sheets.map((sheet) => sheet.name)).toEqual(SYNTHETIC_SHEET_ORDER);
    expect(opened.sheets.slice(0, 12).map((sheet) => sheet.name)).toEqual(HIDDEN_SHEET_NAMES);
    expect(opened.sheets.slice(0, 12).every((sheet) => sheet.visibility === 'hidden')).toBe(true);
    expect(opened.sheets[12]).toMatchObject({
      name: '01092026',
      index: 12,
      visibility: 'visible',
      range: 'A1:CN86',
      rowCount: 86,
      columnCount: 92,
    });
    expect(opened.csvSnapshot).toBeUndefined();
    expect((opened as unknown as Record<string, unknown>)['snapshot']).toBeUndefined();
    expect(loadLocalWorkbook).toBe(openLocalWorkbook);
  });

  it('mantiene el workbook abierto y selectSheet no relee los bytes de entrada', () => {
    const bytes = createGrowingWorkbookBytes();
    const opened = openLocalWorkbook({
      sourceId: 'qa:session',
      fileName: 'precios-crecientes.xlsx',
      data: bytes,
    });

    bytes.fill(0);
    const selected = readySelection(opened.selectSheet('01092026'));
    expect(selected.snapshot.meta.sheet).toBe('01092026');
    expect(selected.snapshot.rows).toHaveLength(86);
  });

  it('cambiar de hoja cambia dimensiones, grupos y precios sin arrastrar la selección anterior', () => {
    const opened = openFixture();
    const september = readySelection(opened.selectSheet('01092026'));
    const july = readySelection(opened.selectSheet('01072026'));

    const septemberAdapted = adaptPricingMatrix(september.snapshot, { sheetInfo: september.sheet });
    const julyAdapted = adaptPricingMatrix(july.snapshot, { sheetInfo: july.sheet });

    expect(septemberAdapted.supported).toBe(true);
    expect(septemberAdapted.sheet.name).toBe('01092026');
    expect(septemberAdapted.sheet.dimensions).toMatchObject({ rowCount: 86, columnCount: 92 });
    expect(septemberAdapted.headers.normalGroups).toHaveLength(22);
    expect(septemberAdapted.headers.eminentGroups).toHaveLength(21);
    expect(knownAmounts(septemberAdapted)).toContain(10000);
    expect(knownAmounts(septemberAdapted)).toContain(7500);

    expect(julyAdapted.supported).toBe(true);
    expect(julyAdapted.sheet.name).toBe('01072026');
    expect(julyAdapted.sheet.dimensions).toMatchObject({ rowCount: 85, columnCount: 96 });
    expect(julyAdapted.headers.normalGroups).toHaveLength(22);
    expect(julyAdapted.headers.eminentGroups).toHaveLength(23);
    expect(knownAmounts(julyAdapted)).toContain(12000);
    expect(knownAmounts(julyAdapted)).toContain(9000);

    expect(september.snapshot.meta.sheet).toBe('01092026');
    expect(septemberAdapted.headers.normalGroups[0]?.groupRaw)
      .not.toBe(julyAdapted.headers.normalGroups[0]?.groupRaw);
  });

  it.each([
    ['01092026', 86, 92, 22, 21],
    ['01072026', 85, 96, 22, 23],
    ['01062026', 85, 49, 23, undefined],
    ['01052026', 90, 49, 23, undefined],
    ['01042026', 94, 47, 22, undefined],
    ['01032026', 93, 45, 21, undefined],
    ['01022026', 100, 43, 20, undefined],
    ['01012026', 92, 43, 20, undefined],
    ['01122025', 108, 41, 19, undefined],
  ] as const)(
    'detecta esquema dinámico de %s sin límites fijos',
    (sheetName, rowCount, columnCount, normalGroups, eminentGroups) => {
      const opened = openFixture();
      const selected = readySelection(opened.selectSheet(sheetName));
      const detection = detectPricingMatrixSchema(selected.snapshot, { sheetInfo: selected.sheet });

      expect(detection.supported).toBe(true);
      expect(detection.sheet.dimensions.rowCount).toBe(rowCount);
      expect(detection.sheet.dimensions.columnCount).toBe(columnCount);
      expect(detection.sheet.headers.normalGroups).toHaveLength(normalGroups);
      expect(detection.sheet.headers.eminentGroups).toHaveLength(eminentGroups ?? 0);

      if (eminentGroups === undefined) {
        expect(detection.diagnostics.some((diagnostic) => diagnostic.code === 'DATA_EMINENT_BLOCK_ABSENT')).toBe(true);
      }
    },
  );

  it('preserva orden de grupos y mantiene SALÓN/DELI como canales separados', () => {
    const opened = openFixture();
    const selected = readySelection(opened.selectSheet('01072026'));
    const adapted = adaptPricingMatrix(selected.snapshot, { sheetInfo: selected.sheet });
    const expected = expectedGroupNames('01072026', MATRIX_SHEET_SPECS['01072026'].normalGroupCount);

    expect(adapted.headers.normalGroups.map((group) => group.groupRaw)).toEqual(expected);
    adapted.headers.normalGroups.forEach((group) => {
      expect(group.tier).toBe('NORMAL');
      expect(group.deliColumn).toBe(group.salonColumn + 1);
      expect(group.salonHeaderRaw).toBe('SALÓN');
      expect(group.deliHeaderRaw).toBe('DELI');
    });

    const firstProduct = adapted.rows.find((row) => row.kind === 'product');
    expect(firstProduct).toBeDefined();
    const firstGroup = firstProduct?.slots.filter((slot) => slot.groupRaw === expected[0] && slot.tier === 'NORMAL') ?? [];
    expect(firstGroup.map((slot) => slot.channel)).toEqual(['SALON', 'DELI']);
  });

  it('acepta una hoja NORMAL-only e informa ausencia ÉMINENT sin derivarla', () => {
    const opened = openFixture();
    const selected = readySelection(opened.selectSheet('01062026'));
    const adapted = adaptPricingMatrix(selected.snapshot, { sheetInfo: selected.sheet });

    expect(adapted.supported).toBe(true);
    expect(adapted.headers.normalGroups).toHaveLength(23);
    expect(adapted.headers.eminentGroups).toHaveLength(0);
    expect(adapted.diagnostics.some((diagnostic) => diagnostic.code === 'DATA_EMINENT_BLOCK_ABSENT')).toBe(true);
    expect(adapted.slots.some((slot) => slot.tier === 'EMINENT')).toBe(false);
  });

  it('no reinterpreta como ÉMINENT un segundo Código/Nombre sin etiqueta inequívoca', () => {
    const opened = openFixture();
    const selected = readySelection(opened.selectSheet(AMBIGUOUS_SECOND_BLOCK_SHEET_NAME));
    const detection = detectPricingMatrixSchema(selected.snapshot, { sheetInfo: selected.sheet });
    const adapted = adaptPricingMatrix(selected.snapshot, { sheetInfo: selected.sheet });

    expect(detection.supported).toBe(false);
    expect(detection.sheet.headers.normalGroups).toHaveLength(1);
    expect(detection.sheet.headers.eminentIdentity).toBeNull();
    expect(detection.sheet.headers.eminentGroups).toHaveLength(0);
    expect(detection.diagnostics.some((diagnostic) => diagnostic.code === 'DATA_SECOND_IDENTITY_UNCLASSIFIED')).toBe(true);
    expect(detection.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-sheet-schema')).toBe(true);
    expect(adapted.supported).toBe(false);
    expect(adapted.rows).toHaveLength(0);
    expect(adapted.slots).toHaveLength(0);
  });

  it('maneja selección inexistente y hoja auxiliar incompatible sin fallback silencioso', () => {
    const opened = openFixture();
    const missing = opened.selectSheet('NO EXISTE');
    expect(missing.status).toBe('sheet-not-found');
    expect(missing.diagnostics.some((diagnostic) => diagnostic.code === 'DATA_SHEET_NOT_FOUND')).toBe(true);

    const auxiliary = readySelection(opened.selectSheet(AUXILIARY_SHEET_NAME));
    const adapted = adaptPricingMatrix(auxiliary.snapshot, { sheetInfo: auxiliary.sheet });
    expect(adapted.supported).toBe(false);
    expect(adapted.sheet.name).toBe(AUXILIARY_SHEET_NAME);
    expect(adapted.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-sheet-schema')).toBe(true);
    expect(adapted.rows).toHaveLength(0);
    expect(adapted.slots).toHaveLength(0);
  });

  it('mantiene regresión CSV como una única tabla lógica lista y sin selección multi-hoja', () => {
    const csv = [
      ',,,Grupo CSV,Grupo CSV',
      'Filtro,Código,Nombre,SALÓN,DELI',
      ',CSV001,PRODUCTO CSV,5000,4500',
    ].join('\n');
    const opened = openLocalWorkbook({
      sourceId: 'qa:csv',
      fileName: 'precios.csv',
      data: new TextEncoder().encode(csv),
    });

    expect(opened.format).toBe('csv');
    expect(opened.status).toBe('ready');
    expect(opened.sheets).toEqual([
      expect.objectContaining({ name: 'CSV', index: 0, visibility: 'visible', rowCount: 3, columnCount: 5 }),
    ]);
    expect(opened.csvSnapshot?.meta.sheet).toBe('CSV');
    expect(opened.selectSheet('OTRA').status).toBe('sheet-not-found');

    const selected = readySelection(opened.selectSheet('CSV'));
    const adapted = adaptPricingMatrix(selected.snapshot, { sheetInfo: selected.sheet });
    expect(adapted.supported).toBe(true);
    expect(adapted.headers.normalGroups).toHaveLength(1);
    expect(adapted.headers.eminentGroups).toHaveLength(0);
    expect(adapted.diagnostics.some((diagnostic) => diagnostic.code === 'DATA_EMINENT_BLOCK_ABSENT')).toBe(true);
  });
});
