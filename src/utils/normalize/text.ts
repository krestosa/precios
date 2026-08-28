const COMBINING_MARKS = /\p{M}+/gu;
const PUNCTUATION_AND_SYMBOLS = /[\p{P}\p{S}]+/gu;
const WHITESPACE = /\s+/gu;

export function normalizeCanonicalText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(PUNCTUATION_AND_SYMBOLS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

export function canonicalTokens(value: string): readonly string[] {
  const canonical = normalizeCanonicalText(value);
  return canonical.length === 0 ? [] : canonical.split(' ');
}

export function canonicalTokenSignature(value: string): string {
  return [...canonicalTokens(value)].sort().join('\u0001');
}

export function normalizeHeaderLiteral(value: string): string {
  return value.normalize('NFC').replace(WHITESPACE, ' ').trim();
}
