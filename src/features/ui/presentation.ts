import type { MatchCandidate, PriceField, SourceLoc } from '../../domain/contracts';
import type { StatusTone } from '../../components';
import type {
  ActionMatchStatus,
  FontUiStatus,
  LayoutIssueView,
  PriceDisplayView,
  ProcessingState,
  ResolutionBlocker,
  ResolutionDefaultsView,
  ResolutionOptionView,
  WorkbenchFileView,
} from './models';

export function processingTone(state: ProcessingState): StatusTone {
  if (state === 'ready') return 'success';
  if (state === 'warning') return 'warning';
  if (state === 'error') return 'danger';
  if (state === 'processing') return 'info';
  return 'neutral';
}

export function processingLabel(state: ProcessingState): string {
  const labels: Record<ProcessingState, string> = {
    queued: 'En cola',
    processing: 'Procesando',
    ready: 'Listo',
    warning: 'Listo con advertencias',
    error: 'Error',
  };
  return labels[state];
}

export function matchMethodLabel(method: MatchCandidate['method']): string {
  const labels: Record<MatchCandidate['method'], string> = {
    'canonical-exact': 'Canónico exacto',
    'exact-tokens': 'Tokens exactos',
    'unambiguous-partial': 'Parcial inequívoco',
    'fuzzy-suggestion': 'Sugerencia aproximada',
    manual: 'Manual',
  };
  return labels[method];
}

export function confidenceLabel(confidence: number): string {
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

export function effectiveActionMatchStatus(file: WorkbenchFileView): ActionMatchStatus {
  if (file.actionMatchStatus) return file.actionMatchStatus;
  if (!file.match) return 'pending';
  return file.match.status;
}

export function actionLabel(file: WorkbenchFileView): string {
  if (file.actionLabel) return file.actionLabel;
  if (file.match?.status === 'matched') return file.match.selected.label;
  return 'Acción sin resolver';
}

export function actionMatchSummary(file: WorkbenchFileView): string {
  const status = effectiveActionMatchStatus(file);
  if (status === 'matched') {
    if (file.actionMatchMethodLabel) return file.actionMatchMethodLabel;
    if (file.match?.status === 'matched') return `${matchMethodLabel(file.match.method)} · ${confidenceLabel(file.match.confidence)}`;
    return 'Coincidencia resuelta';
  }
  if (status === 'suggestion') {
    if (file.match?.status === 'suggestion') return `Sugerencia · ${confidenceLabel(file.match.confidence)}`;
    return 'Sugerencia; requiere revisión';
  }
  if (status === 'ambiguous') return 'Ambigüedad; requiere revisión';
  if (status === 'unmatched') return 'Sin coincidencia';
  return 'Matching de acción pendiente';
}

export function fileMatchSummary(file: WorkbenchFileView): string {
  return actionMatchSummary(file);
}

export function resolutionOptionLabel(options: readonly ResolutionOptionView[], value: string | undefined): string | undefined {
  if (!value) return undefined;
  return options.find((option) => option.value === value)?.label ?? value;
}

export function effectiveLocal(file: WorkbenchFileView, defaults: ResolutionDefaultsView | undefined): string | undefined {
  return file.selectedLocal ?? defaults?.selectedLocal;
}

export function effectiveChannel(file: WorkbenchFileView, defaults: ResolutionDefaultsView | undefined): string | undefined {
  return file.selectedChannel ?? defaults?.selectedChannel;
}

export function resolutionBlocker(file: WorkbenchFileView, defaults: ResolutionDefaultsView | undefined): ResolutionBlocker {
  if (file.resolutionBlocker !== undefined) return file.resolutionBlocker;
  if (effectiveActionMatchStatus(file) !== 'matched') return 'action';
  if (!effectiveLocal(file, defaults)) return 'local';
  if (!effectiveChannel(file, defaults)) return 'channel';
  if (file.prices?.normalDisplay?.state === 'selection-required' || file.prices?.eminentDisplay?.state === 'selection-required') return 'price';
  return null;
}

export function resolutionBlockerLabel(blocker: ResolutionBlocker): string {
  if (blocker === 'action') return 'Falta resolver la acción';
  if (blocker === 'local') return 'Falta seleccionar local';
  if (blocker === 'channel') return 'Falta seleccionar canal';
  if (blocker === 'price') return 'Falta resolver el precio';
  return 'Resolución lista';
}

export function formatPieceLabel(file: WorkbenchFileView): string {
  const format = file.formatLabel ?? 'Formato no informado';
  return file.pieceIndex === undefined ? format : `${format} · Pieza ${file.pieceIndex}`;
}

export function preflightTone(file: WorkbenchFileView): StatusTone {
  if (!file.preflight) return 'neutral';
  if (file.preflight.blocking || file.preflight.issues.some((issue) => issue.severity === 'ERROR')) return 'danger';
  if (file.preflight.issues.some((issue) => issue.severity === 'WARNING')) return 'warning';
  return 'success';
}

export function preflightLabel(file: WorkbenchFileView): string {
  if (!file.preflight) return 'Preflight pendiente';
  if (file.preflight.blocking || file.preflight.issues.some((issue) => issue.severity === 'ERROR')) return 'ERROR';
  if (file.preflight.issues.some((issue) => issue.severity === 'WARNING')) return 'WARNING';
  return 'OK';
}

export function queueWarningCount(file: WorkbenchFileView): number {
  return (file.warnings?.length ?? 0) + (file.preflight?.issues.filter((issue) => issue.severity === 'WARNING').length ?? 0);
}

export function queueErrorCount(file: WorkbenchFileView): number {
  return (file.errors?.length ?? 0) + (file.preflight?.issues.filter((issue) => issue.severity === 'ERROR').length ?? 0);
}

export function formatPrice(field: PriceField | undefined): string {
  if (!field || field.state === 'unknown') return 'Desconocido';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(field.amount);
}

export function priceReason(field: PriceField | undefined): string {
  if (!field) return 'Sin valor provisto';
  if (field.state === 'known') return 'Valor explícito';
  const labels: Record<typeof field.reason, string> = {
    empty: 'Celda vacía',
    missing: 'Dato faltante',
    invalid: 'Valor inválido',
    unresolved: 'Sin resolver',
  };
  return labels[field.reason];
}

export function priceDisplayValue(display: PriceDisplayView | undefined, field: PriceField | undefined): string {
  if (!display) {
    if (!field) return 'Desconocido';
    if (field.state === 'known') return formatPrice(field);
    if (field.reason === 'empty') return 'Celda vacía';
    if (field.reason === 'invalid') return 'Valor inválido';
    return 'Desconocido';
  }
  if (display.state === 'selection-required') return 'Pendiente de selección';
  if (display.state === 'unavailable') return 'No disponible';
  if (display.state === 'empty') return 'Celda vacía';
  if (display.state === 'unknown') return 'Desconocido';
  return field?.state === 'known' ? formatPrice(field) : 'Sin valor resuelto';
}

export function priceDisplayReason(display: PriceDisplayView | undefined, field: PriceField | undefined): string {
  if (display?.message) return display.message;
  if (!display) return priceReason(field);
  if (display.state === 'selection-required') return 'Completá acción, local y canal antes de resolver este precio.';
  if (display.state === 'unavailable') return 'La selección actual no dispone de este nivel de precio.';
  if (display.state === 'empty') return 'La celda correspondiente está vacía.';
  if (display.state === 'unknown') return 'El valor existe como desconocido o no pudo resolverse.';
  return priceReason(field);
}

export function sourceLocText(loc: SourceLoc | undefined): string {
  if (!loc) return 'Ubicación no informada';
  const parts = [
    loc.sheet ? `hoja ${loc.sheet}` : '',
    loc.row !== undefined ? `fila ${loc.row}` : '',
    loc.column !== undefined ? `columna ${String(loc.column)}` : '',
    loc.cell ? `celda ${loc.cell}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Ubicación no informada';
}

export function derivedLayoutIssues(file: WorkbenchFileView): readonly LayoutIssueView[] {
  const explicit = file.layoutIssues ?? [];
  const derived = (file.generation?.overflow ?? []).flatMap((result, index): readonly LayoutIssueView[] => {
    if (result.status !== 'overflow') return [];
    return [{
      id: `engine-overflow-${index}`,
      kind: 'overflow',
      severity: 'WARNING',
      message: result.message ?? `Overflow detectado${result.measuredWidth !== undefined && result.availableWidth !== undefined ? `: ${result.measuredWidth} / ${result.availableWidth}` : ''}`,
      actionLabel: 'Revisar ajuste',
    }];
  });
  return [...explicit, ...derived];
}

export function fontTone(status: FontUiStatus): StatusTone {
  if (status === 'installed' || status === 'uploaded') return 'success';
  if (status === 'mismatch') return 'warning';
  return 'danger';
}

export function fontLabel(status: FontUiStatus): string {
  const labels: Record<FontUiStatus, string> = { installed: 'Instalada', uploaded: 'Cargada', missing: 'Faltante', mismatch: 'No coincide' };
  return labels[status];
}
