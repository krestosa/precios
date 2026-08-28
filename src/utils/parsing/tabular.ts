export type TabularPrimitive = string | number | boolean | null;

export interface ParsedDelimitedTable {
  readonly delimiter: string;
  readonly rows: readonly (readonly (string | null)[])[];
  readonly rowCount: number;
  readonly columnCount: number;
}

const DELIMITER_CANDIDATES = [',', ';', '\t'] as const;

function normalizeField(value: string): string | null {
  return value.length === 0 ? null : value;
}

function parseRows(text: string, delimiter: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }

      if (quoted || field.length === 0) {
        quoted = !quoted;
        continue;
      }
    }

    if (!quoted && char === delimiter) {
      row.push(normalizeField(field));
      field = '';
      continue;
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      row.push(normalizeField(field));
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (quoted) {
    throw new Error('CSV inválido: comillas sin cerrar.');
  }

  if (field.length > 0 || row.length > 0 || text.length === 0) {
    row.push(normalizeField(field));
    rows.push(row);
  }

  return rows;
}

function delimiterScore(text: string, delimiter: string): number {
  let rows: (string | null)[][];

  try {
    rows = parseRows(text, delimiter).slice(0, 12);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  const widths = rows.map((row) => row.length).filter((width) => width > 1);
  if (widths.length === 0) {
    return 0;
  }

  const frequencies = new Map<number, number>();
  for (const width of widths) {
    frequencies.set(width, (frequencies.get(width) ?? 0) + 1);
  }

  let modalWidth = 0;
  let modalCount = 0;
  for (const [width, count] of frequencies) {
    if (count > modalCount || (count === modalCount && width > modalWidth)) {
      modalWidth = width;
      modalCount = count;
    }
  }

  return modalCount * 10_000 + modalWidth;
}

export function detectDelimiter(text: string): string {
  let selected: string = ',';
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of DELIMITER_CANDIDATES) {
    const score = delimiterScore(text, candidate);
    if (score > bestScore) {
      bestScore = score;
      selected = candidate;
    }
  }

  return selected;
}

export function parseDelimitedText(text: string, delimiter?: string): ParsedDelimitedTable {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const effectiveDelimiter = delimiter ?? detectDelimiter(withoutBom);
  const rows = parseRows(withoutBom, effectiveDelimiter);
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);

  return {
    delimiter: effectiveDelimiter,
    rows,
    rowCount: rows.length,
    columnCount,
  };
}

export function columnIndexToLabel(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new RangeError('El índice de columna debe ser un entero mayor o igual a 1.');
  }

  let remaining = index;
  let label = '';

  while (remaining > 0) {
    remaining -= 1;
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26);
  }

  return label;
}
