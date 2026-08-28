import type { Discount25Validation, PriceField } from '../contracts/pricing';

export interface Discount25ValidationOptions {
  readonly absoluteTolerance?: number;
}

const DEFAULT_ABSOLUTE_TOLERANCE = 0.5;

export function validateExplicitEminent25(
  normal: PriceField | undefined,
  eminent: PriceField | undefined,
  options: Discount25ValidationOptions = {},
): Discount25Validation {
  if (normal?.state !== 'known' || eminent?.state !== 'known') {
    return {
      status: 'not-applicable',
      message: 'La validación requiere valores NORMAL y ÉMINENT explícitos y conocidos.',
    };
  }

  const tolerance = Math.max(0, options.absoluteTolerance ?? DEFAULT_ABSOLUTE_TOLERANCE);
  const expectedEminent = normal.amount * 0.75;
  const difference = Math.abs(eminent.amount - expectedEminent);

  if (difference <= tolerance) {
    return {
      status: 'valid',
      expectedEminent,
      difference,
      message: 'El valor ÉMINENT explícito es consistente con un 25% respecto de NORMAL.',
    };
  }

  return {
    status: 'mismatch',
    expectedEminent,
    difference,
    message: 'El valor ÉMINENT explícito diverge de la referencia matemática del 25%.',
  };
}
