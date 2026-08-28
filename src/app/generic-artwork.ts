import type { MatchResult } from '../domain/contracts';
import { reconcilePriceSlots, type ReconciledPricingRecord } from '../domain/pricing/reconcile';
import type { PricingMatrixAdaptedRow } from '../features/data-source';
import {
  prepareSvgPricingContext,
  type PricingActionHypothesis,
  type PricingMatrixGroupView,
  type PricingMatrixModel,
} from '../features/matching/pricing-resolution';
import { normalizeCanonicalText } from '../utils/normalize/text';
import { known, preflightIssue, type RuntimeSourceIdentity } from './types';

export interface RuntimePricingTargetDraft {
  readonly key: string;
  readonly pricingGroup: string;
  readonly pricingGroupCanonical: string;
  readonly scopeLabels: readonly string[];
  readonly pricing: ReconciledPricingRecord;
  readonly complete: boolean;
  readonly issue?: ReturnType<typeof preflightIssue>;
}

export interface RuntimeArtworkResolution {
  readonly identity: RuntimeSourceIdentity;
  readonly match: MatchResult;
}

function headerGroups(rows: readonly PricingMatrixAdaptedRow[], tier: 'NORMAL' | 'EMINENT'): readonly PricingMatrixGroupView[] {
  const byGroup = new Map<string, PricingMatrixGroupView>();
  for (const row of rows) {
    for (const slot of row.slots) {
      if (slot.tier !== tier) continue;
      const canonical = normalizeCanonicalText(slot.groupRaw);
      if (canonical.length === 0 || byGroup.has(canonical)) continue;
      const sameGroup = row.slots.filter((candidate) =>
        candidate.tier === tier && normalizeCanonicalText(candidate.groupRaw) === canonical,
      );
      const salon = sameGroup.find((candidate) => candidate.channel === 'SALON');
      const deli = sameGroup.find((candidate) => candidate.channel === 'DELI');
      byGroup.set(canonical, {
        tier,
        groupRaw: slot.groupRaw,
        salonColumn: 0,
        deliColumn: 0,
        salonHeaderRaw: salon?.channelHeaderRaw ?? null,
        deliHeaderRaw: deli?.channelHeaderRaw ?? null,
      });
    }
  }
  return [...byGroup.values()];
}

function pricingModel(rows: readonly PricingMatrixAdaptedRow[]): PricingMatrixModel {
  return {
    rows,
    headers: {
      normalGroups: headerGroups(rows, 'NORMAL'),
      eminentGroups: headerGroups(rows, 'EMINENT'),
    },
  };
}

function selectedHypothesis(hypotheses: readonly PricingActionHypothesis[], selectedId: string | null): PricingActionHypothesis | null {
  if (selectedId === null) return null;
  return hypotheses.find((hypothesis) => hypothesis.id === selectedId) ?? null;
}

export function resolveRuntimeArtwork(
  fileName: string,
  rows: readonly PricingMatrixAdaptedRow[],
): RuntimeArtworkResolution {
  const context = prepareSvgPricingContext(fileName, pricingModel(rows));
  const selected = selectedHypothesis(context.action.hypotheses, context.action.selectedHypothesisId);
  const sourceLocal = selected?.local?.label ?? null;
  const sourceLocalCanonical = sourceLocal === null ? null : normalizeCanonicalText(sourceLocal);
  return {
    identity: {
      actionName: context.action.identity.actionName,
      actionCanonical: context.action.identity.actionCanonical,
      format: context.action.identity.format,
      pieceIndex: context.action.identity.pieceIndex,
      sourceLocal,
      sourceLocalCanonical,
      sourceScope: selected?.local === undefined || selected.local === null ? 'generic' : 'local-specific',
    },
    match: context.action.result,
  };
}

function scopeLabels(
  row: PricingMatrixAdaptedRow,
  pricing: ReconciledPricingRecord,
): readonly string[] {
  const groupCanonical = normalizeCanonicalText(pricing.record.scope.groupRaw ?? '');
  return [...new Set(row.slots
    .filter((slot) =>
      slot.channel === pricing.record.channel
      && normalizeCanonicalText(slot.groupRaw) === groupCanonical,
    )
    .map((slot) => slot.channelHeaderRaw?.trim() || slot.channel))];
}

function pairSignature(pricing: ReconciledPricingRecord): string {
  const normal = pricing.record.prices.normal;
  const eminent = pricing.record.prices.eminent;
  const normalValue = known(normal) ? String(normal.amount) : `unknown:${normal?.state === 'unknown' ? normal.reason : 'absent'}`;
  const eminentValue = known(eminent) ? String(eminent.amount) : `unknown:${eminent?.state === 'unknown' ? eminent.reason : 'absent'}`;
  return `${normalValue}\u0000${eminentValue}`;
}

export function derivePricingTargets(
  row: PricingMatrixAdaptedRow,
  identity: RuntimeSourceIdentity,
): readonly RuntimePricingTargetDraft[] {
  const reconciled = reconcilePriceSlots(row.slots);
  const localCanonical = identity.sourceLocalCanonical;
  const applicable = reconciled.records.filter((entry) => {
    if (identity.sourceScope !== 'local-specific') return true;
    return localCanonical !== null
      && normalizeCanonicalText(entry.record.scope.groupRaw ?? '') === localCanonical;
  });

  const merged = new Map<string, RuntimePricingTargetDraft>();
  for (const entry of applicable) {
    const pricingGroup = entry.record.scope.groupRaw?.trim() ?? '';
    const pricingGroupCanonical = normalizeCanonicalText(pricingGroup);
    if (pricingGroupCanonical.length === 0) continue;
    const complete = known(entry.record.prices.normal) && known(entry.record.prices.eminent);
    const key = `${pricingGroupCanonical}\u0000${pairSignature(entry)}`;
    const labels = scopeLabels(row, entry);
    const current = merged.get(key);
    if (current !== undefined) {
      merged.set(key, {
        ...current,
        scopeLabels: [...new Set([...current.scopeLabels, ...labels])],
      });
      continue;
    }
    merged.set(key, {
      key,
      pricingGroup,
      pricingGroupCanonical,
      scopeLabels: labels,
      pricing: entry,
      complete,
      ...(complete
        ? {}
        : {
            issue: preflightIssue(
              'ERROR',
              'pricing.explicit-pair-missing',
              `El target ${pricingGroup}${labels.length > 0 ? ` · ${labels.join(' / ')}` : ''} no tiene un par NORMAL/ÉMINENT explícito y completo.`,
            ),
          }),
    });
  }
  return [...merged.values()];
}

export function artworkVariantKey(identity: RuntimeSourceIdentity, selectedActionId: string): string {
  return [
    selectedActionId,
    identity.format ?? '',
    identity.pieceIndex === null ? '' : String(identity.pieceIndex),
  ].join('\u0000');
}
