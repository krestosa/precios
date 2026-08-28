import { html, nothing, type TemplateResult } from 'lit';
import type { StatusTone, TabChangeDetail } from '../../../components';
import type { MatchCandidate, PriceField, SourceLoc } from '../../../domain/contracts';
import type { MatchApplyScope, PreviewCommand } from '../events';
import type { LayoutIssueView, PreviewAsset, PreviewMode, WorkbenchFileView } from '../models';

export const PREVIEW_TABS = [
  { id: 'original', label: 'ORIGINAL' },
  { id: 'result', label: 'RESULT' },
  { id: 'overlay', label: 'OVERLAY' },
] as const;

export interface ReviewTemplateState {
  readonly file: WorkbenchFileView;
  readonly selectedCandidate: string;
  readonly previewMode: PreviewMode;
  readonly zoom: number;
  readonly layoutIssues: readonly LayoutIssueView[];
  readonly preflightTone: StatusTone;
  readonly preflightLabel: string;
  readonly matchSummary: string;
  readonly formatPrice: (field: PriceField | undefined) => string;
  readonly priceReason: (field: PriceField | undefined) => string;
  readonly sourceLocText: (loc: SourceLoc | undefined) => string;
  readonly matchMethodLabel: (method: MatchCandidate['method']) => string;
  readonly confidenceLabel: (confidence: number) => string;
  readonly onOpenDetails: () => void;
  readonly onChooseMatch: (event: Event) => void;
  readonly onApplyMatch: (scope: MatchApplyScope) => void;
  readonly onIssueAction: (issue: LayoutIssueView) => void;
  readonly onPreviewTabChange: (event: CustomEvent<TabChangeDetail>) => void;
  readonly onPreviewCommand: (command: PreviewCommand) => void;
}

function priceFieldTemplate(title: string, field: PriceField | undefined, state: ReviewTemplateState): TemplateResult {
  return html`<article class="price-card" aria-label=${`Precio ${title}`}>
    <h3>${title}</h3>
    <p class=${field?.state === 'known' ? 'price-value' : 'price-value unknown'}>${state.formatPrice(field)}</p>
    <div class="provenance">
      ${state.priceReason(field)}
      ${field?.provenance ? html`<br />Fuente: ${field.provenance.sourceId} · ${field.provenance.sourceKind}<br />${state.sourceLocText(field.provenance.loc)}` : nothing}
    </div>
  </article>`;
}

function matchingTemplate(state: ReviewTemplateState): TemplateResult {
  const match = state.file.match;
  if (!match) return html`<pw-empty-state heading="Matching pendiente" message="El adaptador de matching todavía no reportó un resultado."></pw-empty-state>`;
  if (match.status === 'matched') {
    return html`<div class="match-box">
      <div class="row"><pw-status-chip tone="success" label="Coincidencia resuelta"></pw-status-chip><span class="small muted">${state.matchMethodLabel(match.method)} · ${state.confidenceLabel(match.confidence)}</span></div>
      <div><strong>${match.selected.label}</strong>${match.selected.canonical ? html`<div class="small muted">${match.selected.canonical}</div>` : nothing}</div>
    </div>`;
  }
  if (match.status === 'unmatched') {
    return html`<pw-empty-state heading="Sin coincidencia" message="No se seleccionó ningún local. Se requiere una decisión externa antes de resolver precios."></pw-empty-state>`;
  }

  const isSuggestion = match.status === 'suggestion';
  return html`<div class="match-box">
    <div class="row"><pw-status-chip tone="warning" label=${isSuggestion ? 'Sugerencia; requiere revisión' : 'Ambigüedad; requiere revisión'}></pw-status-chip>${isSuggestion ? html`<span class="small muted">Confianza ${state.confidenceLabel(match.confidence)}. No se aplica automáticamente.</span>` : nothing}</div>
    <ul class="candidate-list" aria-label="Candidatos de matching">
      ${match.candidates.map((candidate) => html`<li class="candidate"><div><strong>${candidate.label}</strong><div class="small muted">${state.matchMethodLabel(candidate.method)} · ${state.confidenceLabel(candidate.confidence)}</div></div>${candidate.canonical ? html`<span class="small muted">${candidate.canonical}</span>` : nothing}</li>`)}
    </ul>
    <label class="small" for=${`candidate-${state.file.id}`}><strong>Selección manual</strong></label>
    <select id=${`candidate-${state.file.id}`} .value=${state.selectedCandidate} @change=${state.onChooseMatch}>
      <option value="">Elegir candidato…</option>
      ${match.candidates.map((candidate) => html`<option value=${candidate.id}>${candidate.label} · ${state.confidenceLabel(candidate.confidence)}</option>`)}
    </select>
    <div class="row">
      <pw-button ?disabled=${!state.selectedCandidate} @click=${() => state.onApplyMatch('session')}>Aplicar a sesión</pw-button>
      <pw-button ?disabled=${!state.selectedCandidate} @click=${() => state.onApplyMatch('batch')}>Aplicar al lote</pw-button>
    </div>
  </div>`;
}

function pricesTemplate(state: ReviewTemplateState): TemplateResult {
  const prices = state.file.prices;
  const validation = prices?.discount25;
  const validationTone = validation?.status === 'mismatch' ? 'warning' : '';
  return html`<div class="stack">
    <div class="price-grid">${priceFieldTemplate('NORMAL', prices?.normal, state)}${priceFieldTemplate('ÉMINENT', prices?.eminent, state)}</div>
    ${validation ? html`<div class=${`validation ${validationTone}`} role="status">
      <strong>Validación 25%: ${validation.status}</strong>${validation.message ? html` · ${validation.message}` : nothing}
      ${validation.expectedEminent !== undefined ? html`<div>Valor esperado para validar: ${new Intl.NumberFormat().format(validation.expectedEminent)}${validation.difference !== undefined ? ` · diferencia ${new Intl.NumberFormat().format(validation.difference)}` : ''}</div>` : nothing}
      <div>Esta validación es informativa y no sustituye el valor ÉMINENT.</div>
    </div>` : html`<div class="validation" role="status">Validación 25% todavía no reportada. No se infiere ningún precio.</div>`}
  </div>`;
}

function layoutIssuesTemplate(state: ReviewTemplateState): TemplateResult {
  if (state.layoutIssues.length === 0) return html`<pw-empty-state heading="Sin incidencias de layout" message="No se reportaron problemas de overflow, alineación o fuentes para este archivo."></pw-empty-state>`;
  return html`<ul class="issue-list" aria-label="Incidencias visuales">${state.layoutIssues.map((issue) => html`<li class="issue"><div class="issue-text"><strong>${issue.kind === 'overflow' ? 'Overflow' : issue.kind === 'alignment' ? 'Alineación' : 'Fuente faltante'}</strong><span class="small muted">${issue.severity} · ${issue.message}</span></div><pw-button @click=${() => state.onIssueAction(issue)}>${issue.actionLabel}</pw-button></li>`)}</ul>`;
}

function previewAssetTemplate(asset: PreviewAsset | undefined, state: ReviewTemplateState): TemplateResult {
  if (!asset) return html`<pw-empty-state heading="Preview no disponible" message="Esta vista todavía no recibió contenido procesado."></pw-empty-state>`;
  return html`<div class="preview-viewport" tabindex="0" aria-label="Viewport de preview con desplazamiento preparado">
    <div class="preview-content" style=${`--pw-preview-scale: ${state.zoom}`}>
      ${asset.kind === 'markup'
        ? html`<iframe sandbox="" title=${asset.label ?? `Preview de ${state.file.fileName}`} .srcdoc=${asset.value}></iframe>`
        : html`<img src=${asset.value} alt=${asset.label ?? `Preview de ${state.file.fileName}`} />`}
    </div>
  </div>`;
}

function previewTemplate(state: ReviewTemplateState): TemplateResult {
  const preview = state.file.preview;
  const asset = state.previewMode === 'original' ? preview?.original : state.previewMode === 'result' ? preview?.result : preview?.overlay;
  return html`<div class="preview-toolbar">
    <pw-segmented-tabs .items=${PREVIEW_TABS} .selected=${state.previewMode} label="Vista de SVG" @tab-change=${state.onPreviewTabChange}></pw-segmented-tabs>
    <div class="preview-controls" aria-label="Controles de viewport">
      <pw-status-chip tone="neutral" label="Pan preparado"></pw-status-chip>
      <pw-button @click=${() => state.onPreviewCommand('fit')}>Fit</pw-button>
      <pw-button @click=${() => state.onPreviewCommand('zoom-out')} aria-label="Alejar preview">−</pw-button>
      <span class="small" aria-live="polite">${Math.round(state.zoom * 100)}%</span>
      <pw-button @click=${() => state.onPreviewCommand('zoom-in')} aria-label="Acercar preview">+</pw-button>
      <pw-button @click=${() => state.onPreviewCommand('reset')}>Reset</pw-button>
    </div>
  </div>
  ${preview?.status === 'error' ? html`<pw-empty-state heading="Error de preview" message=${preview.message ?? 'El procesador reportó un error para esta vista.'}></pw-empty-state>` : previewAssetTemplate(asset, state)}`;
}

export function reviewTemplate(state: ReviewTemplateState): TemplateResult {
  return html`<pw-panel heading="Archivo seleccionado" description="Revisión desacoplada de parsing, matching, pricing y generación.">
    <div class="stack">
      <div class="row-between"><div class="filename">${state.file.fileName}</div><div class="row"><pw-status-chip tone=${state.preflightTone} label=${state.preflightLabel}></pw-status-chip><pw-button @click=${state.onOpenDetails}>Ver trazabilidad</pw-button></div></div>
      <div class="summary-grid">
        <div class="metric"><span class="metric-label">Local detectado</span><strong>${state.file.detectedLocal ?? 'Sin detectar'}</strong></div>
        <div class="metric"><span class="metric-label">Matching</span><strong>${state.matchSummary}</strong></div>
        <div class="metric"><span class="metric-label">Placeholder / precio</span><strong>${state.file.classification ?? 'Sin clasificar'}</strong></div>
      </div>
    </div>
  </pw-panel>
  <pw-panel heading="Revisión de matching" description="Las sugerencias aproximadas y ambigüedades requieren una elección humana.">${matchingTemplate(state)}</pw-panel>
  <pw-panel heading="Precios" description="NORMAL y ÉMINENT permanecen independientes; ausencia significa desconocido.">${pricesTemplate(state)}</pw-panel>
  <pw-panel heading="Incidencias visuales" description="Overflow, alineación y fuentes se muestran como diagnósticos accionables.">${layoutIssuesTemplate(state)}</pw-panel>
  <pw-panel heading="Preview" description="La UI recibe contenido ya procesado y no modifica el SVG.">${previewTemplate(state)}</pw-panel>`;
}
