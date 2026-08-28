import type { Diagnostic } from '../../domain/contracts/core';
import type { MatchCandidate, MatchResult } from '../../domain/contracts/matching';
import type { Channel, PriceField, ProductRef } from '../../domain/contracts/pricing';
import type { PriceSlot, PriceTier } from '../../domain/pricing/slots';
import { normalizeCanonicalText } from '../../utils/normalize/text';
import type { NameMatcherOptions } from './name-matcher';
import {
  actionNameWithoutLocal,
  findSvgLocalCandidates,
  matchAction,
  parseSvgIdentity,
  reinterpretSvgIdentity,
  type SvgFormatDefinition,
  type SvgIdentity,
  type SvgIdentityLocalCandidate,
} from './svg-identity';

export type PricingResolutionDiagnosticCode =
  | 'PRICING_ACTION_MATCH_REQUIRED'
  | 'PRICING_LOCAL_SELECTION_REQUIRED'
  | 'PRICING_LOCAL_SELECTION_INVALID'
  | 'PRICING_CHANNEL_SELECTION_REQUIRED'
  | 'PRICING_CHANNEL_SELECTION_INVALID'
  | 'PRICING_TIER_ABSENT'
  | 'PRICING_SLOT_AMBIGUOUS';

export interface PricingMatrixGroupView {
  readonly tier: PriceTier;
  readonly groupRaw: string;
  readonly salonColumn: number;
  readonly deliColumn: number;
  readonly salonHeaderRaw?: string | null;
  readonly deliHeaderRaw?: string | null;
}

export interface PricingMatrixProductRowView {
  readonly kind: 'product' | 'section' | 'empty';
  readonly sourceRow: number;
  readonly sourceRecordId: string;
  readonly product?: ProductRef;
  readonly slots: readonly PriceSlot[];
  readonly diagnostics?: readonly Diagnostic[];
}

export interface PricingMatrixModel {
  readonly rows: readonly PricingMatrixProductRowView[];
  readonly headers: {
    readonly normalGroups: readonly PricingMatrixGroupView[];
    readonly eminentGroups: readonly PricingMatrixGroupView[];
  };
}

export interface PricingLocalGroupRef {
  readonly tier: PriceTier;
  readonly label: string;
  readonly salonColumn: number;
  readonly deliColumn: number;
  readonly salonHeaderRaw: string | null;
  readonly deliHeaderRaw: string | null;
}

export interface PricingChannelOption {
  readonly channel: Channel;
  readonly label: string;
}

export interface PricingLocalOption {
  readonly id: string;
  readonly label: string;
  readonly canonical: string;
  readonly order: number;
  readonly normalGroups: readonly PricingLocalGroupRef[];
  readonly eminentGroups: readonly PricingLocalGroupRef[];
  readonly channels: readonly PricingChannelOption[];
}

export type PricingActionHypothesisKind = 'action-only' | 'local-prefix' | 'local-suffix';

export interface PricingActionHypothesis {
  readonly id: string;
  readonly kind: PricingActionHypothesisKind;
  readonly identity: SvgIdentity;
  readonly local: PricingLocalOption | null;
  readonly result: MatchResult;
  readonly selectedRow: PricingMatrixProductRowView | null;
  readonly evidenceStrength: number;
}

export interface PricingActionMatch {
  readonly identity: SvgIdentity;
  readonly result: MatchResult;
  readonly selectedRow: PricingMatrixProductRowView | null;
  readonly hypotheses: readonly PricingActionHypothesis[];
  readonly selectedHypothesisId: string | null;
}

export interface SvgPricingContext {
  readonly identity: SvgIdentity;
  readonly action: PricingActionMatch;
  readonly localOptions: readonly PricingLocalOption[];
  readonly suggestedLocal: PricingLocalOption | null;
  readonly actionFamily: string | null;
}

export interface PrepareSvgPricingContextOptions {
  readonly formats?: readonly SvgFormatDefinition[];
  readonly matcher?: NameMatcherOptions;
}

export type PricingActionRequiredReason = 'unknown' | 'no-match' | 'ambiguous' | 'suggestion';

export type PricingTierResolution =
  | {
      readonly status: 'available';
      readonly tier: PriceTier;
      readonly field: PriceField;
      readonly slot: PriceSlot;
    }
  | {
      readonly status: 'unavailable';
      readonly tier: PriceTier;
      readonly reason: 'absent';
    }
  | {
      readonly status: 'ambiguous';
      readonly tier: PriceTier;
      readonly reason: 'multiple-slots';
      readonly slots: readonly PriceSlot[];
    };

export interface PricingResolvedSelection {
  readonly status: 'resolved';
  readonly action: PricingMatrixProductRowView;
  readonly local: PricingLocalOption;
  readonly channel: PricingChannelOption;
  readonly normal: PricingTierResolution;
  readonly eminent: PricingTierResolution;
  readonly diagnostics: readonly Diagnostic[];
}

export type PricingSelectionResolution =
  | {
      readonly status: 'action-match-required';
      readonly reason: PricingActionRequiredReason;
      readonly action: PricingActionMatch | null;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: 'local-selection-required';
      readonly action: PricingMatrixProductRowView;
      readonly localOptions: readonly PricingLocalOption[];
      readonly suggestedLocal: PricingLocalOption | null;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly status: 'channel-selection-required';
      readonly action: PricingMatrixProductRowView;
      readonly local: PricingLocalOption;
      readonly channelOptions: readonly PricingChannelOption[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | PricingResolvedSelection;

export type PricingActionInput = PricingActionMatch | PricingMatrixProductRowView;
export type PricingLocalSelection = string | PricingLocalOption | null | undefined;

interface MutableLocalOption {
  readonly id: string;
  readonly label: string;
  readonly canonical: string;
  readonly order: number;
  readonly normalGroups: PricingLocalGroupRef[];
  readonly eminentGroups: PricingLocalGroupRef[];
}

function productRows(model: PricingMatrixModel): readonly PricingMatrixProductRowView[] {
  return model.rows.filter(
    (row) => row.kind === 'product' && row.product !== undefined && row.product.nameRaw.trim().length > 0,
  );
}

function groupRef(group: PricingMatrixGroupView): PricingLocalGroupRef {
  return {
    tier: group.tier,
    label: group.groupRaw,
    salonColumn: group.salonColumn,
    deliColumn: group.deliColumn,
    salonHeaderRaw: group.salonHeaderRaw ?? null,
    deliHeaderRaw: group.deliHeaderRaw ?? null,
  };
}

function channelOptionsForGroups(groups: readonly PricingLocalGroupRef[]): readonly PricingChannelOption[] {
  if (groups.length === 0) return [];

  const firstSalon = groups.find((group) => group.salonHeaderRaw?.trim().length)?.salonHeaderRaw ?? 'SALÓN';
  const firstDeli = groups.find((group) => group.deliHeaderRaw?.trim().length)?.deliHeaderRaw ?? 'DELI';
  return [
    { channel: 'SALON', label: firstSalon },
    { channel: 'DELI', label: firstDeli },
  ];
}

export function listPricingLocalOptions(model: PricingMatrixModel): readonly PricingLocalOption[] {
  const byCanonical = new Map<string, MutableLocalOption>();
  let order = 0;

  const visit = (group: PricingMatrixGroupView): void => {
    const canonical = normalizeCanonicalText(group.groupRaw);
    if (canonical.length === 0) return;

    let option = byCanonical.get(canonical);
    if (option === undefined) {
      option = {
        id: canonical,
        label: group.groupRaw,
        canonical,
        order,
        normalGroups: [],
        eminentGroups: [],
      };
      order += 1;
      byCanonical.set(canonical, option);
    }

    const target = group.tier === 'NORMAL' ? option.normalGroups : option.eminentGroups;
    target.push(groupRef(group));
  };

  model.headers.normalGroups.forEach(visit);
  model.headers.eminentGroups.forEach(visit);

  return [...byCanonical.values()]
    .sort((left, right) => left.order - right.order)
    .map((option) => {
      const groups = [...option.normalGroups, ...option.eminentGroups];
      return {
        id: option.id,
        label: option.label,
        canonical: option.canonical,
        order: option.order,
        normalGroups: option.normalGroups,
        eminentGroups: option.eminentGroups,
        channels: channelOptionsForGroups(groups),
      };
    });
}

function actionTargets(model: PricingMatrixModel): {
  readonly rows: readonly PricingMatrixProductRowView[];
  readonly targets: readonly { readonly id: string; readonly label: string }[];
} {
  const rows = productRows(model);
  return {
    rows,
    targets: rows.map((row) => ({
      id: row.sourceRecordId,
      label: row.product!.nameRaw,
    })),
  };
}

function selectedRowForResult(
  result: MatchResult,
  rows: readonly PricingMatrixProductRowView[],
): PricingMatrixProductRowView | null {
  if (result.status !== 'matched') return null;
  return rows.find((row) => row.sourceRecordId === result.selected.id) ?? null;
}

function matchEvidenceStrength(result: MatchResult): number {
  if (result.status !== 'matched') return 0;
  switch (result.method) {
    case 'manual':
      return 4;
    case 'canonical-exact':
      return 3;
    case 'exact-tokens':
      return 2;
    case 'unambiguous-partial':
      return 1;
  }
}

export function matchPricingAction(
  identity: SvgIdentity,
  model: PricingMatrixModel,
  options: NameMatcherOptions = {},
): PricingActionMatch {
  const { rows, targets } = actionTargets(model);
  const result = matchAction(identity, targets, options);
  return {
    identity,
    result,
    selectedRow: selectedRowForResult(result, rows),
    hypotheses: [],
    selectedHypothesisId: null,
  };
}

function localCandidateKey(candidate: SvgIdentityLocalCandidate): string {
  return `${candidate.id ?? candidate.canonical}\u0000${candidate.position}`;
}

function hypothesisId(kind: PricingActionHypothesisKind, local: PricingLocalOption | null): string {
  if (local === null) return 'action-only';
  return `${kind}:${local.id}`;
}

function buildHypotheses(
  structuralIdentity: SvgIdentity,
  model: PricingMatrixModel,
  localOptions: readonly PricingLocalOption[],
  options: NameMatcherOptions,
): readonly PricingActionHypothesis[] {
  const { rows, targets } = actionTargets(model);
  const hypotheses: PricingActionHypothesis[] = [];

  const evaluate = (
    kind: PricingActionHypothesisKind,
    identity: SvgIdentity,
    local: PricingLocalOption | null,
  ): void => {
    const result = matchAction(identity, targets, options);
    hypotheses.push({
      id: hypothesisId(kind, local),
      kind,
      identity,
      local,
      result,
      selectedRow: selectedRowForResult(result, rows),
      evidenceStrength: matchEvidenceStrength(result),
    });
  };

  // A siempre compite: todo el texto restante se interpreta como acción.
  evaluate('action-only', structuralIdentity, null);

  const localById = new Map(localOptions.map((local) => [local.id, local] as const));
  const candidates = findSvgLocalCandidates(
    structuralIdentity,
    localOptions.map((local) => ({ id: local.id, label: local.label })),
  );
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = localCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);

    const local = candidate.id === undefined ? null : localById.get(candidate.id) ?? null;
    if (local === null) continue;
    const actionName = actionNameWithoutLocal(structuralIdentity, candidate);
    if (actionName === null) continue;
    const identity = reinterpretSvgIdentity(structuralIdentity, actionName, candidate);
    evaluate(candidate.position === 'prefix' ? 'local-prefix' : 'local-suffix', identity, local);
  }

  return hypotheses;
}

function uniqueCandidates(candidates: readonly MatchCandidate[]): readonly MatchCandidate[] {
  const byId = new Map<string, MatchCandidate>();
  for (const candidate of candidates) {
    const current = byId.get(candidate.id);
    if (current === undefined || candidate.confidence > current.confidence) {
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()].sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label));
}

function hypothesisInterpretationKey(hypothesis: PricingActionHypothesis): string {
  if (hypothesis.result.status !== 'matched') return hypothesis.id;
  const localId = hypothesis.local?.id ?? '';
  const position = hypothesis.identity.localHint?.position ?? '';
  return `${hypothesis.result.selected.id}\u0000${localId}\u0000${position}`;
}

function localCandidatesFromHypotheses(
  hypotheses: readonly PricingActionHypothesis[],
): readonly SvgIdentityLocalCandidate[] {
  const byKey = new Map<string, SvgIdentityLocalCandidate>();
  for (const hypothesis of hypotheses) {
    for (const candidate of hypothesis.identity.localCandidates) {
      byKey.set(localCandidateKey(candidate), candidate);
    }
  }
  return [...byKey.values()];
}

function ambiguousResultFromHypotheses(
  hypotheses: readonly PricingActionHypothesis[],
): MatchResult {
  const candidates = uniqueCandidates(hypotheses.flatMap((hypothesis) => {
    if (hypothesis.result.status === 'matched') return [hypothesis.result.selected];
    return [...hypothesis.result.candidates];
  }));
  return { status: 'ambiguous', candidates, requiresHuman: true };
}

function resolveHypotheses(
  structuralIdentity: SvgIdentity,
  hypotheses: readonly PricingActionHypothesis[],
): PricingActionMatch {
  const matched = hypotheses.filter((hypothesis) => hypothesis.result.status === 'matched');
  if (matched.length > 0) {
    const strongest = Math.max(...matched.map((hypothesis) => hypothesis.evidenceStrength));
    const strongestHypotheses = matched.filter((hypothesis) => hypothesis.evidenceStrength === strongest);
    const interpretations = new Map<string, PricingActionHypothesis>();
    for (const hypothesis of strongestHypotheses) {
      interpretations.set(hypothesisInterpretationKey(hypothesis), hypothesis);
    }

    if (interpretations.size === 1) {
      const selected = [...interpretations.values()][0]!;
      return {
        identity: selected.identity,
        result: selected.result,
        selectedRow: selected.selectedRow,
        hypotheses,
        selectedHypothesisId: selected.id,
      };
    }

    const ambiguousHypotheses = [...interpretations.values()];
    const identity = reinterpretSvgIdentity(
      structuralIdentity,
      structuralIdentity.actionName,
      null,
      localCandidatesFromHypotheses(ambiguousHypotheses),
    );
    return {
      identity,
      result: ambiguousResultFromHypotheses(ambiguousHypotheses),
      selectedRow: null,
      hypotheses,
      selectedHypothesisId: null,
    };
  }

  const internallyAmbiguous = hypotheses.filter((hypothesis) => hypothesis.result.status === 'ambiguous');
  if (internallyAmbiguous.length > 0) {
    const identity = reinterpretSvgIdentity(
      structuralIdentity,
      structuralIdentity.actionName,
      null,
      localCandidatesFromHypotheses(internallyAmbiguous),
    );
    return {
      identity,
      result: ambiguousResultFromHypotheses(internallyAmbiguous),
      selectedRow: null,
      hypotheses,
      selectedHypothesisId: null,
    };
  }

  const suggestions = hypotheses
    .filter((hypothesis) => hypothesis.result.status === 'suggestion')
    .sort((left, right) => {
      const leftConfidence = left.result.status === 'suggestion' ? left.result.confidence : 0;
      const rightConfidence = right.result.status === 'suggestion' ? right.result.confidence : 0;
      return rightConfidence - leftConfidence;
    });
  const bestSuggestion = suggestions[0];
  if (bestSuggestion !== undefined && bestSuggestion.result.status === 'suggestion') {
    return {
      identity: structuralIdentity,
      result: {
        ...bestSuggestion.result,
        candidates: uniqueCandidates(suggestions.flatMap((hypothesis) => [...hypothesis.result.candidates])),
      },
      selectedRow: null,
      hypotheses,
      selectedHypothesisId: null,
    };
  }

  return {
    identity: structuralIdentity,
    result: {
      status: 'unmatched',
      candidates: uniqueCandidates(hypotheses.flatMap((hypothesis) => [...hypothesis.result.candidates])),
    },
    selectedRow: null,
    hypotheses,
    selectedHypothesisId: null,
  };
}

function suggestedLocalForIdentity(
  identity: SvgIdentity,
  localOptions: readonly PricingLocalOption[],
): PricingLocalOption | null {
  if (identity.localHint === null) return null;
  return localOptions.find((option) => option.id === identity.localHint?.id) ?? null;
}

export function prepareSvgPricingContext(
  filename: string,
  model: PricingMatrixModel,
  options: PrepareSvgPricingContextOptions = {},
): SvgPricingContext {
  const localOptions = listPricingLocalOptions(model);
  const structuralIdentity = parseSvgIdentity(
    filename,
    options.formats === undefined ? {} : { formats: options.formats },
  );
  const hypotheses = buildHypotheses(structuralIdentity, model, localOptions, options.matcher ?? {});
  const action = resolveHypotheses(structuralIdentity, hypotheses);

  return {
    identity: action.identity,
    action,
    localOptions,
    suggestedLocal: suggestedLocalForIdentity(action.identity, localOptions),
    // El modelo actual no conserva una relación fiable producto -> familia/modalidad.
    actionFamily: null,
  };
}

function actionRequiredReason(action: PricingActionMatch): PricingActionRequiredReason | null {
  if (action.identity.status === 'unknown') return 'unknown';
  if (action.result.status === 'ambiguous') return 'ambiguous';
  if (action.result.status === 'suggestion') return 'suggestion';
  if (action.result.status === 'unmatched') return 'no-match';
  return action.selectedRow === null ? 'no-match' : null;
}

function selectedActionRow(action: PricingActionInput): PricingMatrixProductRowView | null {
  if ('result' in action) {
    return action.result.status === 'matched' ? action.selectedRow : null;
  }
  return action.kind === 'product' && action.product !== undefined ? action : null;
}

function resolveLocalSelection(
  selection: PricingLocalSelection,
  options: readonly PricingLocalOption[],
): PricingLocalOption | null {
  if (selection === null || selection === undefined) return null;
  const canonical = normalizeCanonicalText(typeof selection === 'string' ? selection : selection.id);
  return options.find((option) => option.id === canonical) ?? null;
}

function resolveChannelSelection(
  selection: Channel | null | undefined,
  options: readonly PricingChannelOption[],
): PricingChannelOption | null {
  if (selection === null || selection === undefined) {
    return options.length === 1 ? options[0]! : null;
  }
  return options.find((option) => option.channel === selection) ?? null;
}

function tierResolution(
  row: PricingMatrixProductRowView,
  local: PricingLocalOption,
  channel: Channel,
  tier: PriceTier,
  diagnostics: Diagnostic[],
): PricingTierResolution {
  const slots = row.slots.filter(
    (slot) =>
      slot.tier === tier &&
      slot.channel === channel &&
      normalizeCanonicalText(slot.groupRaw) === local.id,
  );

  if (slots.length === 0) {
    diagnostics.push({
      code: 'PRICING_TIER_ABSENT' satisfies PricingResolutionDiagnosticCode,
      message: 'El local y canal seleccionados no tienen una columna disponible para este tier.',
      details: {
        sourceRow: row.sourceRow,
        local: local.label,
        channel,
        tier,
      },
    });
    return { status: 'unavailable', tier, reason: 'absent' };
  }

  if (slots.length > 1) {
    diagnostics.push({
      code: 'PRICING_SLOT_AMBIGUOUS' satisfies PricingResolutionDiagnosticCode,
      message: 'Más de una celda coincide con la misma acción, local, canal y tier; no se elige una silenciosamente.',
      details: {
        sourceRow: row.sourceRow,
        local: local.label,
        channel,
        tier,
        slotIds: slots.map((slot) => slot.id),
      },
    });
    return { status: 'ambiguous', tier, reason: 'multiple-slots', slots };
  }

  return {
    status: 'available',
    tier,
    field: slots[0]!.field,
    slot: slots[0]!,
  };
}

function rowDiagnostics(row: PricingMatrixProductRowView): Diagnostic[] {
  return row.diagnostics === undefined ? [] : [...row.diagnostics];
}

export function resolvePricingSelection(
  model: PricingMatrixModel,
  action: PricingActionInput,
  localSelection: PricingLocalSelection = null,
  channelSelection: Channel | null = null,
): PricingSelectionResolution {
  if ('result' in action) {
    const reason = actionRequiredReason(action);
    if (reason !== null) {
      const diagnostic: Diagnostic = {
        code: 'PRICING_ACTION_MATCH_REQUIRED' satisfies PricingResolutionDiagnosticCode,
        message: 'La acción del SVG todavía no tiene una coincidencia seleccionable de producto.',
        details: { reason, matchStatus: action.result.status },
      };
      return {
        status: 'action-match-required',
        reason,
        action,
        diagnostics: [diagnostic],
      };
    }
  }

  const row = selectedActionRow(action);
  if (row === null) {
    const diagnostic: Diagnostic = {
      code: 'PRICING_ACTION_MATCH_REQUIRED' satisfies PricingResolutionDiagnosticCode,
      message: 'No hay una fila de producto válida seleccionada para resolver precios.',
      details: { reason: 'no-match' },
    };
    return {
      status: 'action-match-required',
      reason: 'no-match',
      action: 'result' in action ? action : null,
      diagnostics: [diagnostic],
    };
  }

  const diagnostics = rowDiagnostics(row);
  const localOptions = listPricingLocalOptions(model);
  const local = resolveLocalSelection(localSelection, localOptions);
  const suggestedLocal = 'result' in action ? suggestedLocalForIdentity(action.identity, localOptions) : null;

  if (local === null) {
    const invalidSelection = localSelection !== null && localSelection !== undefined;
    diagnostics.push({
      code: invalidSelection
        ? 'PRICING_LOCAL_SELECTION_INVALID' satisfies PricingResolutionDiagnosticCode
        : 'PRICING_LOCAL_SELECTION_REQUIRED' satisfies PricingResolutionDiagnosticCode,
      message: invalidSelection
        ? 'El local seleccionado no pertenece a los grupos detectados de la hoja actual.'
        : 'La acción está resuelta, pero falta seleccionar un local de la hoja actual.',
      details: {
        sourceRow: row.sourceRow,
        availableLocals: localOptions.map((option) => option.label),
      },
    });
    return {
      status: 'local-selection-required',
      action: row,
      localOptions,
      suggestedLocal,
      diagnostics,
    };
  }

  const channel = resolveChannelSelection(channelSelection, local.channels);
  if (channel === null) {
    const invalidSelection = channelSelection !== null && channelSelection !== undefined;
    diagnostics.push({
      code: invalidSelection
        ? 'PRICING_CHANNEL_SELECTION_INVALID' satisfies PricingResolutionDiagnosticCode
        : 'PRICING_CHANNEL_SELECTION_REQUIRED' satisfies PricingResolutionDiagnosticCode,
      message: invalidSelection
        ? 'El canal seleccionado no existe para el local actual.'
        : 'El local está seleccionado, pero hay que elegir un canal antes de resolver precios.',
      details: {
        sourceRow: row.sourceRow,
        local: local.label,
        availableChannels: local.channels.map((option) => option.channel),
      },
    });
    return {
      status: 'channel-selection-required',
      action: row,
      local,
      channelOptions: local.channels,
      diagnostics,
    };
  }

  const normal = tierResolution(row, local, channel.channel, 'NORMAL', diagnostics);
  const eminent = tierResolution(row, local, channel.channel, 'EMINENT', diagnostics);

  return {
    status: 'resolved',
    action: row,
    local,
    channel,
    normal,
    eminent,
    diagnostics,
  };
}
