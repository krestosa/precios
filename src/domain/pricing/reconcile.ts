import type { Diagnostic } from '../contracts/core';
import type { Discount25Validation, PricePair, PricingRecord } from '../contracts/pricing';
import { normalizeHeaderLiteral } from '../../utils/normalize/text';
import type { PriceSlot } from './slots';
import { validateExplicitEminent25 } from './discount-validation';

export type PricingReconcileDiagnosticCode =
  | 'PRICING_TIER_UNPAIRED'
  | 'PRICING_DUPLICATE_SLOT';

export interface ReconciledPricingRecord {
  readonly record: PricingRecord;
  readonly discount25: Discount25Validation;
}

export interface PriceSlotReconciliationResult {
  readonly records: readonly ReconciledPricingRecord[];
  readonly unreconciledSlots: readonly PriceSlot[];
  readonly diagnostics: readonly Diagnostic[];
}

interface SlotBucket {
  readonly sourceRecordId: string;
  readonly groupKey: string;
  readonly channel: PriceSlot['channel'];
  readonly normal: PriceSlot[];
  readonly eminent: PriceSlot[];
}

function bucketKey(slot: PriceSlot): string {
  return `${slot.sourceRecordId}\u0000${slot.channel}\u0000${normalizeHeaderLiteral(slot.groupRaw)}`;
}

function pricePair(normal: PriceSlot | undefined, eminent: PriceSlot | undefined): PricePair {
  return {
    ...(normal === undefined ? {} : { normal: normal.field }),
    ...(eminent === undefined ? {} : { eminent: eminent.field }),
  };
}

export function reconcilePriceSlots(slots: readonly PriceSlot[]): PriceSlotReconciliationResult {
  const buckets = new Map<string, SlotBucket>();
  const diagnostics: Diagnostic[] = [];
  const unreconciledSlots: PriceSlot[] = [];
  const records: ReconciledPricingRecord[] = [];

  for (const slot of slots) {
    const key = bucketKey(slot);
    const existing = buckets.get(key);

    if (existing === undefined) {
      const created: SlotBucket = {
        sourceRecordId: slot.sourceRecordId,
        groupKey: normalizeHeaderLiteral(slot.groupRaw),
        channel: slot.channel,
        normal: [],
        eminent: [],
      };
      buckets.set(key, created);
      (slot.tier === 'NORMAL' ? created.normal : created.eminent).push(slot);
    } else {
      (slot.tier === 'NORMAL' ? existing.normal : existing.eminent).push(slot);
    }
  }

  for (const bucket of buckets.values()) {
    if (bucket.normal.length > 1 || bucket.eminent.length > 1) {
      const duplicated = [...bucket.normal, ...bucket.eminent];
      unreconciledSlots.push(...duplicated);
      diagnostics.push({
        code: 'PRICING_DUPLICATE_SLOT' satisfies PricingReconcileDiagnosticCode,
        message: 'Hay más de un slot del mismo tier para el mismo registro, grupo y canal; no se reconcilia automáticamente.',
        details: {
          sourceRecordId: bucket.sourceRecordId,
          groupRaw: bucket.groupKey,
          channel: bucket.channel,
          normalCount: bucket.normal.length,
          eminentCount: bucket.eminent.length,
        },
      });
      continue;
    }

    const normal = bucket.normal[0];
    const eminent = bucket.eminent[0];
    const reference = normal ?? eminent;
    if (reference === undefined) {
      continue;
    }

    if (normal === undefined || eminent === undefined) {
      diagnostics.push({
        code: 'PRICING_TIER_UNPAIRED' satisfies PricingReconcileDiagnosticCode,
        message: 'El grupo/canal no tiene un par NORMAL/ÉMINENT con encabezado inequívocamente equivalente.',
        details: {
          sourceRecordId: bucket.sourceRecordId,
          groupRaw: reference.groupRaw,
          channel: bucket.channel,
          presentTier: normal === undefined ? 'EMINENT' : 'NORMAL',
        },
      });
    }

    const record: PricingRecord = {
      id: `${bucket.sourceRecordId}:${bucket.channel}:${bucket.groupKey}`,
      product: reference.product,
      scope: { groupRaw: reference.groupRaw },
      channel: bucket.channel,
      prices: pricePair(normal, eminent),
    };

    records.push({
      record,
      discount25: validateExplicitEminent25(normal?.field, eminent?.field),
    });
  }

  return { records, unreconciledSlots, diagnostics };
}
