import type { MatchCandidate, PriceField, SourceLoc } from '../../domain/contracts';
import type { StatusTone } from '../../components';
import type { FontUiStatus, LayoutIssueView, WorkbenchFileView } from './models';

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

export function fileMatchSummary(file: WorkbenchFileView): string {
  const match = file.match;
  if (!match) return 'Matching pendiente';
  if (match.status === 'matched') return `${matchMethodLabel(match.method)} · ${confidenceLabel(match.confidence)}`;
  if (match.status === 'suggestion') return `Sugerencia · ${confidenceLabel(match.confidence)}`;
  if (match.status === 'ambiguous') return 'Revisión manual';
  return 'Sin coincidencia';
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
