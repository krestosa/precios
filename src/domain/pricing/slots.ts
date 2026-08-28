import type { Channel, PriceField, ProductRef, ValueProvenance } from '../contracts/pricing';

export type PriceTier = 'NORMAL' | 'EMINENT';

export interface PriceSlot {
  readonly id: string;
  readonly sourceRecordId: string;
  readonly sourceRow: number;
  readonly product: ProductRef;
  readonly tier: PriceTier;
  readonly groupRaw: string;
  readonly channel: Channel;
  readonly headerRaw: string | null;
  readonly channelHeaderRaw: string | null;
  readonly field: PriceField;
}

const INTEGER_PRICE = /^[+-]?\d+$/u;
const DECIMAL_PRICE = /^[+-]?\d+[.,]\d{1,2}$/u;

export function priceFieldFromRaw(
  raw: string | number | boolean | null,
  provenance: ValueProvenance,
): PriceField {
  if (raw === null) {
    return { state: 'unknown', reason: 'empty', provenance };
  }

  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { state: 'known', amount: raw, provenance }
      : { state: 'unknown', reason: 'invalid', provenance };
  }

  if (typeof raw === 'boolean') {
    return { state: 'unknown', reason: 'invalid', provenance };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { state: 'unknown', reason: 'empty', provenance };
  }

  if (!INTEGER_PRICE.test(trimmed) && !DECIMAL_PRICE.test(trimmed)) {
    return { state: 'unknown', reason: 'invalid', provenance };
  }

  const amount = Number(trimmed.replace(',', '.'));
  return Number.isFinite(amount)
    ? { state: 'known', amount, provenance }
    : { state: 'unknown', reason: 'invalid', provenance };
}
