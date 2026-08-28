import type { Diagnostic } from '../../domain/contracts/core';
import type { Channel, PriceField, ProductRef } from '../../domain/contracts/pricing';
import type { PriceSlot, PriceTier } from '../../domain/pricing/slots';
import { normalizeCanonicalText } from '../../utils/normalize/text';
import { matchAction, parseSvgIdentity, type SvgFormatDefinition, type SvgIdentity } from './svg-identity';
import type { MatchResult } from '../../domain/contracts/matching';
import type { NameMatcherOptions } from './name-matcher';

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

export interface PricingActionMatch {
  readonly identity: SvgIdentity;
  readonly result: MatchResult;
  readonly selectedRow: PricingMatrixProductRowView | null;
}

export interface SvgPricingContext {
  readonly identity: SvgIdentity;
  readonly action: PricingActionMatch;
  readonly localOptions: readonly PricingLocalOption[];
  readonly suggestedLocal: PricingLocalOption | null;
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

export function matchPricingAction(
  identity: SvgIdentity,
  model: PricingMatrixModel,
  options: NameMatcherOptions = {},
): PricingActionMatch {
  const rows = productRows(model);
  const targets = rows.map((row) => ({
    id: row.sourceRecordId,
    label: row.product!.nameRaw,
  }));
  const result = matchAction(identity, targets, options);
  const selectedRow = result.status === 'matched'
    ? rows.find((row) => row.sourceRecordId === result.selected.id) ?? null
    : null;

  return { identity, result, selectedRow };
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
  const identity = parseSvgIdentity(filename, {
    ...(options.formats === undefined ? {} : { formats: options.formats }),
    localHints: localOptions.map((local) => ({ id: local.id, label: local.label })),
  });
  const action = matchPricingAction(identity, model, options.matcher);

  return {
    identity,
    action,
    localOptions,
    suggestedLocal: suggestedLocalForIdentity(identity, localOptions),
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
