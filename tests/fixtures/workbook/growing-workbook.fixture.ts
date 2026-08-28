import * as XLSX from 'xlsx';

export const HIDDEN_SHEET_NAMES = [
  '22.07',
  '12.08',
  '02.09',
  '03.10',
  '01.11',
  '24.11',
  '12.12',
  '17.01',
  '02.02',
  '02.03',
  '17.03',
  'Copia de 0101',
] as const;

export interface MatrixSheetFixtureSpec {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly normalGroupCount: number;
  readonly eminentGroupCount?: number;
  readonly normalAmount: number;
  readonly eminentAmount?: number;
}

export const MATRIX_SHEET_SPECS = {
  '01092026': { rowCount: 86, columnCount: 92, normalGroupCount: 22, eminentGroupCount: 21, normalAmount: 10000, eminentAmount: 7500 },
  '01082026': { rowCount: 86, columnCount: 92, normalGroupCount: 22, eminentGroupCount: 21, normalAmount: 10500, eminentAmount: 7800 },
  '01072026': { rowCount: 85, columnCount: 96, normalGroupCount: 22, eminentGroupCount: 23, normalAmount: 12000, eminentAmount: 9000 },
  '01062026': { rowCount: 85, columnCount: 49, normalGroupCount: 23, normalAmount: 13000 },
  '01052026': { rowCount: 90, columnCount: 49, normalGroupCount: 23, normalAmount: 13100 },
  '01042026': { rowCount: 94, columnCount: 47, normalGroupCount: 22, normalAmount: 13200 },
  '01032026': { rowCount: 93, columnCount: 45, normalGroupCount: 21, normalAmount: 13300 },
  '01022026': { rowCount: 100, columnCount: 43, normalGroupCount: 20, normalAmount: 13400 },
  '01012026': { rowCount: 92, columnCount: 43, normalGroupCount: 20, normalAmount: 13500 },
  '01122025': { rowCount: 108, columnCount: 41, normalGroupCount: 19, normalAmount: 13600 },
} as const satisfies Readonly<Record<string, MatrixSheetFixtureSpec>>;

export const AUXILIARY_SHEET_NAME = 'AUXILIAR';
export const AMBIGUOUS_SECOND_BLOCK_SHEET_NAME = 'BLOQUE AMBIGUO';

const FILLER_VISIBLE_SHEET_NAMES = Array.from(
  { length: 35 },
  (_, index) => `VISIBLE QA ${String(index + 1).padStart(2, '0')}`,
);

export const VISIBLE_SHEET_NAMES = [
  ...Object.keys(MATRIX_SHEET_SPECS),
  AUXILIARY_SHEET_NAME,
  AMBIGUOUS_SECOND_BLOCK_SHEET_NAME,
  ...FILLER_VISIBLE_SHEET_NAMES,
] as const;

export const SYNTHETIC_SHEET_ORDER = [
  ...HIDDEN_SHEET_NAMES,
  ...VISIBLE_SHEET_NAMES,
] as const;

function setCell(sheet: XLSX.WorkSheet, row: number, column: number, value: string | number): void {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });
  sheet[address] = typeof value === 'number'
    ? { t: 'n', v: value }
    : { t: 's', v: value };
}

function groupName(sheetName: string, index: number): string {
  return `${sheetName}-G${String(index + 1).padStart(2, '0')}`;
}

function expectedColumnCount(spec: MatrixSheetFixtureSpec): number {
  if (spec.eminentGroupCount === undefined) {
    return 3 + spec.normalGroupCount * 2;
  }
  return 6 + spec.normalGroupCount * 2 + spec.eminentGroupCount * 2;
}

function matrixSheet(sheetName: string, spec: MatrixSheetFixtureSpec): XLSX.WorkSheet {
  if (expectedColumnCount(spec) !== spec.columnCount) {
    throw new Error(`Fixture inconsistente para ${sheetName}: ancho declarado ${spec.columnCount}.`);
  }

  const sheet: XLSX.WorkSheet = {};
  sheet['!ref'] = `A1:${XLSX.utils.encode_col(spec.columnCount - 1)}${spec.rowCount}`;

  setCell(sheet, 3, 1, 'Filtro');
  setCell(sheet, 3, 2, 'Código');
  setCell(sheet, 3, 3, 'Nombre');
  setCell(sheet, 4, 1, 'SI');
  setCell(sheet, 4, 2, 'QA001');
  setCell(sheet, 4, 3, 'ROLL EXACTO');

  for (let index = 0; index < spec.normalGroupCount; index += 1) {
    const salonColumn = 4 + index * 2;
    const deliColumn = salonColumn + 1;
    const name = groupName(sheetName, index);
    setCell(sheet, 2, salonColumn, name);
    setCell(sheet, 2, deliColumn, name);
    setCell(sheet, 3, salonColumn, 'SALÓN');
    setCell(sheet, 3, deliColumn, 'DELI');
    if (index === 0) setCell(sheet, 4, salonColumn, spec.normalAmount);
  }

  if (spec.eminentGroupCount !== undefined) {
    const secondCodeColumn = 5 + spec.normalGroupCount * 2;
    const secondNameColumn = secondCodeColumn + 1;
    const eminentStartColumn = secondNameColumn + 1;
    setCell(sheet, 2, secondCodeColumn, 'ÉMINENT');
    setCell(sheet, 3, secondCodeColumn, 'Código');
    setCell(sheet, 3, secondNameColumn, 'Nombre');
    setCell(sheet, 4, secondCodeColumn, 'QA001');
    setCell(sheet, 4, secondNameColumn, 'ROLL EXACTO');

    for (let index = 0; index < spec.eminentGroupCount; index += 1) {
      const salonColumn = eminentStartColumn + index * 2;
      const deliColumn = salonColumn + 1;
      const name = groupName(sheetName, index);
      setCell(sheet, 2, salonColumn, name);
      setCell(sheet, 2, deliColumn, name);
      setCell(sheet, 3, salonColumn, 'SALÓN');
      setCell(sheet, 3, deliColumn, 'DELI');
      if (index === 0 && spec.eminentAmount !== undefined) setCell(sheet, 4, salonColumn, spec.eminentAmount);
    }
  }

  return sheet;
}

function auxiliarySheet(): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  sheet['!ref'] = 'A1:D6';
  setCell(sheet, 1, 1, 'Notas auxiliares');
  setCell(sheet, 2, 1, 'Dato');
  setCell(sheet, 2, 2, 'Valor');
  setCell(sheet, 3, 1, 'Versión');
  setCell(sheet, 3, 2, 'QA');
  return sheet;
}

function ambiguousSecondBlockSheet(): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  sheet['!ref'] = 'A1:L8';
  setCell(sheet, 2, 4, 'Grupo principal');
  setCell(sheet, 2, 5, 'Grupo principal');
  setCell(sheet, 2, 7, 'Bloque secundario');
  setCell(sheet, 2, 9, 'Grupo secundario');
  setCell(sheet, 2, 10, 'Grupo secundario');
  setCell(sheet, 3, 1, 'Filtro');
  setCell(sheet, 3, 2, 'Código');
  setCell(sheet, 3, 3, 'Nombre');
  setCell(sheet, 3, 4, 'SALÓN');
  setCell(sheet, 3, 5, 'DELI');
  setCell(sheet, 3, 7, 'Código');
  setCell(sheet, 3, 8, 'Nombre');
  setCell(sheet, 3, 9, 'SALÓN');
  setCell(sheet, 3, 10, 'DELI');
  setCell(sheet, 4, 2, 'QA002');
  setCell(sheet, 4, 3, 'SEGUNDO BLOQUE');
  setCell(sheet, 4, 4, 15000);
  setCell(sheet, 4, 7, 'QA002');
  setCell(sheet, 4, 8, 'SEGUNDO BLOQUE');
  setCell(sheet, 4, 9, 11000);
  return sheet;
}

function placeholderSheet(name: string): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  sheet['!ref'] = 'A1:A1';
  setCell(sheet, 1, 1, name);
  return sheet;
}

export function createGrowingWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  SYNTHETIC_SHEET_ORDER.forEach((name) => {
    const spec = MATRIX_SHEET_SPECS[name as keyof typeof MATRIX_SHEET_SPECS];
    const sheet = spec !== undefined
      ? matrixSheet(name, spec)
      : name === AUXILIARY_SHEET_NAME
        ? auxiliarySheet()
        : name === AMBIGUOUS_SECOND_BLOCK_SHEET_NAME
          ? ambiguousSecondBlockSheet()
          : placeholderSheet(name);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });

  // La metadata de visibilidad reproduce las primeras doce hojas ocultas sin alterar su orden.
  (workbook as XLSX.WorkBook & {
    Workbook?: { Sheets?: Array<{ name: string; Hidden: number }> };
  }).Workbook = {
    Sheets: SYNTHETIC_SHEET_ORDER.map((name, index) => ({
      name,
      Hidden: index < HIDDEN_SHEET_NAMES.length ? 1 : 0,
    })),
  };

  return workbook;
}

export function createGrowingWorkbookBytes(): Uint8Array {
  const output = XLSX.write(createGrowingWorkbook(), { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(output);
}

export function expectedGroupNames(sheetName: keyof typeof MATRIX_SHEET_SPECS, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => groupName(sheetName, index));
}
