import { LitElement, css, html, nothing } from 'lit';
import '../../components';
import '../../layout/workbench-layout';
import '../../styles/tokens.css';
import type { FilesSelectedDetail, TabChangeDetail } from '../../components';
import type { MatchCandidate, PreflightIssue, PriceField, SourceLoc } from '../../domain/contracts';
import {
  dispatchWorkbenchEvent,
  type ManifestUiFormat,
  type MatchApplyScope,
  type PreviewCommand,
} from './events';
import {
  EMPTY_WORKBENCH_MODEL,
  type FontUiStatus,
  type LayoutIssueView,
  type PreviewAsset,
  type PreviewMode,
  type WorkbenchFileView,
  type WorkbenchViewModel,
} from './models';
import { WorkbenchUiStore } from './ui-store';

const PREVIEW_TABS = [
  { id: 'original', label: 'ORIGINAL' },
  { id: 'result', label: 'RESULT' },
  { id: 'overlay', label: 'OVERLAY' },
] as const;

const STAGES = ['Fuente local', 'SVG', 'Matching', 'Precios', 'Preflight', 'Preview', 'Export'] as const;

export class PriceWorkbench extends LitElement {
  static override properties = {
    model: { attribute: false },
  };

  static override styles = css`
    :host {
      display: block;
      min-height: 100%;
      box-sizing: border-box;
      color: var(--pw-color-ink, #17202a);
      background: var(--pw-color-canvas, #f4f6f8);
      font-family: var(--pw-font-family, sans-serif);
    }
    *, *::before, *::after { box-sizing: border-box; }
    .app { min-height: 100%; padding: clamp(0.75rem, 2vw, 1.5rem); }
    .topbar { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
    .eyebrow { margin: 0 0 .25rem; color: var(--pw-color-accent, #1859c9); font-size: var(--pw-font-size-sm, .75rem); font-weight: 750; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 0; font-size: clamp(1.45rem, 3vw, var(--pw-font-size-2xl, 1.625rem)); line-height: 1.08; }
    .subtitle { max-width: 48rem; margin: .45rem 0 0; color: var(--pw-color-ink-muted, #59636e); font-size: var(--pw-font-size-md, .875rem); line-height: 1.45; }
    .top-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; align-items: center; }
    .stages { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(8.5rem, 1fr); gap: .35rem; margin: 0 0 1rem; padding: .45rem; overflow-x: auto; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-lg, .875rem); background: var(--pw-color-surface, #fff); }
    .stage { display: flex; align-items: center; gap: .5rem; min-width: 0; padding: .52rem .6rem; border-radius: var(--pw-radius-md, .625rem); background: var(--pw-color-canvas, #f4f6f8); color: var(--pw-color-ink-muted, #59636e); font-size: var(--pw-font-size-sm, .75rem); font-weight: 650; white-space: nowrap; }
    .stage-number { display: grid; place-items: center; flex: 0 0 1.35rem; aspect-ratio: 1; border-radius: 50%; color: #fff; background: var(--pw-color-accent, #1859c9); font-size: .68rem; }
    .stack { display: grid; gap: .75rem; }
    .row { display: flex; gap: .65rem; align-items: center; flex-wrap: wrap; }
    .row-between { display: flex; gap: .75rem; align-items: flex-start; justify-content: space-between; }
    .muted { color: var(--pw-color-ink-muted, #59636e); }
    .small { font-size: var(--pw-font-size-sm, .75rem); line-height: 1.4; }
    .filename { min-width: 0; overflow-wrap: anywhere; font-weight: 750; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem; }
    .metric { min-width: 0; padding: .7rem; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); background: var(--pw-color-canvas, #f4f6f8); }
    .metric-label { display: block; margin-bottom: .25rem; color: var(--pw-color-ink-muted, #59636e); font-size: var(--pw-font-size-sm, .75rem); }
    .metric strong { display: block; overflow-wrap: anywhere; font-size: var(--pw-font-size-md, .875rem); }
    .price-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    .price-card { min-height: 7rem; padding: .85rem; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); }
    .price-card h3 { margin: 0 0 .65rem; font-size: var(--pw-font-size-sm, .75rem); letter-spacing: .07em; }
    .price-value { margin: 0; font-size: 1.35rem; font-weight: 780; }
    .unknown { color: var(--pw-color-ink-muted, #59636e); font-size: 1rem; }
    .provenance { margin-top: .55rem; color: var(--pw-color-ink-muted, #59636e); font-size: .7rem; line-height: 1.35; overflow-wrap: anywhere; }
    .validation { padding: .65rem .75rem; border-left: 3px solid var(--pw-color-info, #175cd3); background: #f4f7ff; font-size: var(--pw-font-size-sm, .75rem); line-height: 1.45; }
    .validation.warning { border-color: var(--pw-color-warning, #8a4b08); background: #fff8ec; }
    .match-box { display: grid; gap: .7rem; }
    select { width: 100%; min-height: 2.35rem; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); padding: .5rem .65rem; color: var(--pw-color-ink, #17202a); background: var(--pw-color-surface, #fff); font: inherit; }
    select:focus-visible, button:focus-visible { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 30%, transparent); outline-offset: 2px; }
    .candidate-list, .issue-list, .font-list, .export-list, .preflight-list, .trace-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    .candidate, .issue, .font-item, .export-item, .preflight-item { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; padding: .65rem .7rem; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); }
    .issue-text, .font-text, .export-text { min-width: 0; }
    .issue-text strong, .font-text strong, .export-text strong { display: block; overflow-wrap: anywhere; }
    .preview-toolbar { display: flex; justify-content: space-between; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
    .preview-controls { display: flex; gap: .35rem; align-items: center; flex-wrap: wrap; }
    .preview-viewport { min-height: 28rem; max-height: 65vh; overflow: auto; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); background: repeating-conic-gradient(#eef1f4 0 25%, #fff 0 50%) 50% / 18px 18px; cursor: grab; }
    .preview-viewport:active { cursor: grabbing; }
    .preview-content { width: 100%; min-height: 28rem; transform: scale(var(--pw-preview-scale, 1)); transform-origin: top left; transition: transform var(--pw-motion-fast, 120ms) var(--pw-motion-ease, ease); }
    .preview-content iframe { display: block; width: 100%; min-height: 28rem; border: 0; background: #fff; }
    .preview-content img { display: block; max-width: none; min-width: 100%; height: auto; }
    .preflight-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45rem; }
    .trace-grid { display: grid; grid-template-columns: minmax(8rem, .8fr) minmax(0, 1.4fr); gap: .55rem .8rem; margin: 0; font-size: var(--pw-font-size-sm, .75rem); }
    .trace-grid dt { color: var(--pw-color-ink-muted, #59636e); }
    .trace-grid dd { margin: 0; overflow-wrap: anywhere; }
    .trace-section { margin-top: 1.15rem; padding-top: 1rem; border-top: 1px solid var(--pw-color-border, #d4dae0); }
    .trace-section h3 { margin: 0 0 .6rem; font-size: var(--pw-font-size-md, .875rem); }
    .source-location { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .7rem; }
    .export-note { margin: 0; line-height: 1.45; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 38rem) { .topbar { display: grid; } .top-actions { justify-content: flex-start; } .summary-grid, .price-grid, .preflight-summary { grid-template-columns: 1fr; } .preview-viewport, .preview-content, .preview-content iframe { min-height: 20rem; } }
    @media (prefers-reduced-motion: reduce) { .preview-content { transition: none; } }
  `;

  model: WorkbenchViewModel = EMPTY_WORKBENCH_MODEL;
  private readonly ui = new WorkbenchUiStore();

  private get selectedFile(): WorkbenchFileView | undefined {
    const id = this.ui.state.selectedFileId;
    return this.model.files.find((file) => file.id === id)
      ?? this.model.files.find((file) => file.selected)
      ?? this.model.files[0];
  }

  private fileMatchSummary(file: WorkbenchFileView): string {
    const match = file.match;
    if (!match) return 'Matching pendiente';
    if (match.status === 'matched') return `${this.matchMethodLabel(match.method)} · ${this.confidenceLabel(match.confidence)}`;
    if (match.status === 'suggestion') return `Sugerencia · ${this.confidenceLabel(match.confidence)}`;
    if (match.status === 'ambiguous') return 'Revisión manual';
    return 'Sin coincidencia';
  }

  private matchMethodLabel(method: MatchCandidate['method']): string {
    const labels: Record<MatchCandidate['method'], string> = {
      'canonical-exact': 'Canónico exacto',
      'exact-tokens': 'Tokens exactos',
      'unambiguous-partial': 'Parcial inequívoco',
      'fuzzy-suggestion': 'Sugerencia aproximada',
      manual: 'Manual',
    };
    return labels[method];
  }

  private confidenceLabel(confidence: number): string {
    const bounded = Math.max(0, Math.min(1, confidence));
    return `${Math.round(bounded * 100)}%`;
  }

  private preflightTone(file: WorkbenchFileView): 'neutral' | 'success' | 'warning' | 'danger' {
    if (!file.preflight) return 'neutral';
    if (file.preflight.blocking || file.preflight.issues.some((issue) => issue.severity === 'ERROR')) return 'danger';
    if (file.preflight.issues.some((issue) => issue.severity === 'WARNING')) return 'warning';
    return 'success';
  }

  private preflightLabel(file: WorkbenchFileView): string {
    if (!file.preflight) return 'Preflight pendiente';
    if (file.preflight.blocking || file.preflight.issues.some((issue) => issue.severity === 'ERROR')) return 'ERROR';
    if (file.preflight.issues.some((issue) => issue.severity === 'WARNING')) return 'WARNING';
    return 'OK';
  }

  private onPriceSourceFiles(event: CustomEvent<FilesSelectedDetail>): void {
    dispatchWorkbenchEvent(this, 'pw:price-source-files', { files: event.detail.files });
  }

  private onSvgFiles(event: CustomEvent<FilesSelectedDetail>): void {
    dispatchWorkbenchEvent(this, 'pw:svg-files', { files: event.detail.files });
  }

  private onFontFiles(event: CustomEvent<FilesSelectedDetail>): void {
    dispatchWorkbenchEvent(this, 'pw:font-files', { files: event.detail.files });
  }

  private onFileActivate(event: CustomEvent<{ readonly id: string }>): void {
    this.ui.selectFile(event.detail.id);
    this.requestUpdate();
  }

  private onPreviewTabChange(event: CustomEvent<TabChangeDetail>): void {
    const mode = event.detail.id as PreviewMode;
    if (!PREVIEW_TABS.some((tab) => tab.id === mode)) return;
    this.ui.setPreviewMode(mode);
    this.requestUpdate();
  }

  private chooseMatch(fileId: string, event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    this.ui.chooseMatch(fileId, select.value);
    this.requestUpdate();
  }

  private applyMatch(fileId: string, scope: MatchApplyScope): void {
    const candidateId = this.ui.state.matchChoiceByFile[fileId];
    if (!candidateId) return;
    dispatchWorkbenchEvent(this, 'pw:match-apply', { fileId, candidateId, scope });
  }

  private runPreflight(): void {
    dispatchWorkbenchEvent(this, 'pw:preflight-request', { fileIds: this.model.files.map((file) => file.id) });
  }

  private previewCommand(fileId: string, command: PreviewCommand): void {
    if (command === 'zoom-in') this.ui.zoomIn();
    if (command === 'zoom-out') this.ui.zoomOut();
    if (command === 'reset' || command === 'fit') this.ui.resetZoom();
    this.requestUpdate();
    dispatchWorkbenchEvent(this, 'pw:preview-command', { fileId, command, zoom: this.ui.state.zoom });
  }

  private issueAction(fileId: string, issue: LayoutIssueView): void {
    dispatchWorkbenchEvent(this, 'pw:issue-action', { fileId, issueId: issue.id, kind: issue.kind });
  }

  private exportRequest(kind: 'batch' | 'file' | 'zip', fileIds: readonly string[]): void {
    dispatchWorkbenchEvent(this, 'pw:export-request', { kind, fileIds });
  }

  private manifestRequest(format: ManifestUiFormat, fileIds: readonly string[]): void {
    dispatchWorkbenchEvent(this, 'pw:export-request', { kind: 'manifest', fileIds, manifestFormat: format });
  }

  private openDetails(): void {
    this.ui.setDetailsOpen(true);
    this.requestUpdate();
  }

  private closeDetails(): void {
    this.ui.setDetailsOpen(false);
    this.requestUpdate();
  }

  private formatPrice(field: PriceField | undefined): string {
    if (!field || field.state === 'unknown') return 'Desconocido';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(field.amount);
  }

  private priceReason(field: PriceField | undefined): string {
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

  private sourceLocText(loc: SourceLoc | undefined): string {
    if (!loc) return 'Ubicación no informada';
    const parts = [
      loc.sheet ? `hoja ${loc.sheet}` : '',
      loc.row !== undefined ? `fila ${loc.row}` : '',
      loc.column !== undefined ? `columna ${String(loc.column)}` : '',
      loc.cell ? `celda ${loc.cell}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Ubicación no informada';
  }

  private renderPriceField(title: string, field: PriceField | undefined) {
    return html`<article class="price-card" aria-label=${`Precio ${title}`}>
      <h3>${title}</h3>
      <p class=${field?.state === 'known' ? 'price-value' : 'price-value unknown'}>${this.formatPrice(field)}</p>
      <div class="provenance">
        ${this.priceReason(field)}
        ${field?.provenance ? html`<br />Fuente: ${field.provenance.sourceId} · ${field.provenance.sourceKind}<br />${this.sourceLocText(field.provenance.loc)}` : nothing}
      </div>
    </article>`;
  }

  private renderMatching(file: WorkbenchFileView) {
    const match = file.match;
    if (!match) return html`<pw-empty-state heading="Matching pendiente" message="El adaptador de matching todavía no reportó un resultado."></pw-empty-state>`;
    if (match.status === 'matched') {
      return html`<div class="match-box">
        <div class="row"><pw-status-chip tone="success" label="Coincidencia resuelta"></pw-status-chip><span class="small muted">${this.matchMethodLabel(match.method)} · ${this.confidenceLabel(match.confidence)}</span></div>
        <div><strong>${match.selected.label}</strong>${match.selected.canonical ? html`<div class="small muted">${match.selected.canonical}</div>` : nothing}</div>
      </div>`;
    }
    if (match.status === 'unmatched') {
      return html`<pw-empty-state heading="Sin coincidencia" message="No se seleccionó ningún local. Se requiere una decisión externa antes de resolver precios."></pw-empty-state>`;
    }

    const selectedCandidate = this.ui.state.matchChoiceByFile[file.id] ?? '';
    const isSuggestion = match.status === 'suggestion';
    return html`<div class="match-box">
      <div class="row"><pw-status-chip tone="warning" label=${isSuggestion ? 'Sugerencia; requiere revisión' : 'Ambigüedad; requiere revisión'}></pw-status-chip>${isSuggestion ? html`<span class="small muted">Confianza ${this.confidenceLabel(match.confidence)}. No se aplica automáticamente.</span>` : nothing}</div>
      <ul class="candidate-list" aria-label="Candidatos de matching">
        ${match.candidates.map((candidate) => html`<li class="candidate"><div><strong>${candidate.label}</strong><div class="small muted">${this.matchMethodLabel(candidate.method)} · ${this.confidenceLabel(candidate.confidence)}</div></div>${candidate.canonical ? html`<span class="small muted">${candidate.canonical}</span>` : nothing}</li>`)}
      </ul>
      <label class="small" for=${`candidate-${file.id}`}><strong>Selección manual</strong></label>
      <select id=${`candidate-${file.id}`} .value=${selectedCandidate} @change=${(event: Event) => this.chooseMatch(file.id, event)}>
        <option value="">Elegir candidato…</option>
        ${match.candidates.map((candidate) => html`<option value=${candidate.id}>${candidate.label} · ${this.confidenceLabel(candidate.confidence)}</option>`)}
      </select>
      <div class="row">
        <pw-button ?disabled=${!selectedCandidate} @click=${() => this.applyMatch(file.id, 'session')}>Aplicar a sesión</pw-button>
        <pw-button ?disabled=${!selectedCandidate} @click=${() => this.applyMatch(file.id, 'batch')}>Aplicar al lote</pw-button>
      </div>
    </div>`;
  }

  private renderPrices(file: WorkbenchFileView) {
    const prices = file.prices;
    const validation = prices?.discount25;
    const validationTone = validation?.status === 'mismatch' ? 'warning' : '';
    return html`<div class="stack">
      <div class="price-grid">${this.renderPriceField('NORMAL', prices?.normal)}${this.renderPriceField('ÉMINENT', prices?.eminent)}</div>
      ${validation ? html`<div class=${`validation ${validationTone}`} role="status">
        <strong>Validación 25%: ${validation.status}</strong>${validation.message ? html` · ${validation.message}` : nothing}
        ${validation.expectedEminent !== undefined ? html`<div>Valor esperado para validar: ${new Intl.NumberFormat().format(validation.expectedEminent)}${validation.difference !== undefined ? ` · diferencia ${new Intl.NumberFormat().format(validation.difference)}` : ''}</div>` : nothing}
        <div>Esta validación es informativa y no sustituye el valor ÉMINENT.</div>
      </div>` : html`<div class="validation" role="status">Validación 25% todavía no reportada. No se infiere ningún precio.</div>`}
    </div>`;
  }

  private derivedLayoutIssues(file: WorkbenchFileView): readonly LayoutIssueView[] {
    const explicit = file.layoutIssues ?? [];
    const overflow = file.generation?.overflow ?? [];
    const derived = overflow.flatMap((result, index): readonly LayoutIssueView[] => {
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

  private renderLayoutIssues(file: WorkbenchFileView) {
    const issues = this.derivedLayoutIssues(file);
    if (issues.length === 0) return html`<pw-empty-state heading="Sin incidencias de layout" message="No se reportaron problemas de overflow, alineación o fuentes para este archivo."></pw-empty-state>`;
    return html`<ul class="issue-list" aria-label="Incidencias visuales">${issues.map((issue) => html`<li class="issue"><div class="issue-text"><strong>${issue.kind === 'overflow' ? 'Overflow' : issue.kind === 'alignment' ? 'Alineación' : 'Fuente faltante'}</strong><span class="small muted">${issue.severity} · ${issue.message}</span></div><pw-button @click=${() => this.issueAction(file.id, issue)}>${issue.actionLabel}</pw-button></li>`)}</ul>`;
  }

  private renderPreviewAsset(asset: PreviewAsset | undefined, file: WorkbenchFileView) {
    if (!asset) return html`<pw-empty-state heading="Preview no disponible" message="Esta vista todavía no recibió contenido procesado."></pw-empty-state>`;
    const style = `--pw-preview-scale: ${this.ui.state.zoom}`;
    return html`<div class="preview-viewport" tabindex="0" aria-label="Viewport de preview con desplazamiento preparado">
      <div class="preview-content" style=${style}>
        ${asset.kind === 'markup'
          ? html`<iframe sandbox="" title=${asset.label ?? `Preview de ${file.fileName}`} .srcdoc=${asset.value}></iframe>`
          : html`<img src=${asset.value} alt=${asset.label ?? `Preview de ${file.fileName}`} />`}
      </div>
    </div>`;
  }

  private renderPreview(file: WorkbenchFileView) {
    const mode = this.ui.state.previewMode;
    const preview = file.preview;
    const asset = mode === 'original' ? preview?.original : mode === 'result' ? preview?.result : preview?.overlay;
    return html`<div class="preview-toolbar">
      <pw-segmented-tabs .items=${PREVIEW_TABS} .selected=${mode} label="Vista de SVG" @tab-change=${this.onPreviewTabChange}></pw-segmented-tabs>
      <div class="preview-controls" aria-label="Controles de viewport">
        <pw-status-chip tone="neutral" label="Pan preparado"></pw-status-chip>
        <pw-button @click=${() => this.previewCommand(file.id, 'fit')}>Fit</pw-button>
        <pw-button @click=${() => this.previewCommand(file.id, 'zoom-out')} aria-label="Alejar preview">−</pw-button>
        <span class="small" aria-live="polite">${Math.round(this.ui.state.zoom * 100)}%</span>
        <pw-button @click=${() => this.previewCommand(file.id, 'zoom-in')} aria-label="Acercar preview">+</pw-button>
        <pw-button @click=${() => this.previewCommand(file.id, 'reset')}>Reset</pw-button>
      </div>
    </div>
    ${preview?.status === 'error' ? html`<pw-empty-state heading="Error de preview" message=${preview.message ?? 'El procesador reportó un error para esta vista.'}></pw-empty-state>` : this.renderPreviewAsset(asset, file)}`;
  }

  private fontTone(status: FontUiStatus): 'success' | 'warning' | 'danger' | 'info' {
    if (status === 'installed' || status === 'uploaded') return 'success';
    if (status === 'mismatch') return 'warning';
    return 'danger';
  }

  private fontLabel(status: FontUiStatus): string {
    const labels: Record<FontUiStatus, string> = { installed: 'Instalada', uploaded: 'Cargada', missing: 'Faltante', mismatch: 'No coincide' };
    return labels[status];
  }

  private renderFonts() {
    const fonts = this.model.fonts;
    return html`<pw-panel heading="Fuentes requeridas" description="W4 sólo entrega archivos al resolver tipográfico; no interpreta metadata.">
      <div class="stack">
        ${fonts.length === 0 ? html`<pw-empty-state heading="Sin requisitos reportados" message="El motor todavía no informó fuentes requeridas."></pw-empty-state>` : html`<ul class="font-list" aria-label="Fuentes requeridas">${fonts.map((font) => html`<li class="font-item"><div class="font-text"><strong>${font.record.spec.family}</strong><span class="small muted">Peso ${font.record.spec.weight} · ${font.record.spec.style}${font.requiredBy?.length ? ` · ${font.requiredBy.length} archivo(s)` : ''}</span></div><pw-status-chip tone=${this.fontTone(font.uiStatus)} label=${this.fontLabel(font.uiStatus)}></pw-status-chip></li>`)}</ul>`}
        <pw-file-dropzone accept=".ttf,.otf,.woff,.woff2" multiple status=${this.model.fontLoadStatus} label="Agregar fuentes locales" helper="TTF, OTF, WOFF o WOFF2" @files-selected=${this.onFontFiles}></pw-file-dropzone>
      </div>
    </pw-panel>`;
  }

  private severityTone(severity: PreflightIssue['severity']): 'success' | 'warning' | 'danger' {
    return severity === 'OK' ? 'success' : severity === 'WARNING' ? 'warning' : 'danger';
  }

  private renderPreflight() {
    const preflight = this.model.preflight;
    if (!preflight) {
      return html`<pw-panel heading="Preflight" description="Resumen agregado y estado por archivo."><div class="stack"><pw-empty-state heading="Preflight pendiente" message="Ejecutalo cuando matching, precios y tipografías estén disponibles."></pw-empty-state><pw-button variant="primary" @click=${this.runPreflight}>Ejecutar preflight</pw-button></div></pw-panel>`;
    }
    const issues = [...(preflight.issues ?? []), ...preflight.files.flatMap((file) => file.issues)];
    const ok = issues.filter((issue) => issue.severity === 'OK').length;
    const warnings = issues.filter((issue) => issue.severity === 'WARNING').length;
    const errors = issues.filter((issue) => issue.severity === 'ERROR').length;
    return html`<pw-panel heading="Preflight" description="Los errores se aíslan por archivo; los válidos permanecen exportables.">
      <div class="stack">
        <div class="preflight-summary"><pw-status-chip tone="success" label=${`${ok} OK`}></pw-status-chip><pw-status-chip tone="warning" label=${`${warnings} WARNING`}></pw-status-chip><pw-status-chip tone="danger" label=${`${errors} ERROR`}></pw-status-chip></div>
        <ul class="preflight-list" aria-label="Preflight por SVG">${preflight.files.map((file) => {
          const highest = file.blocking || file.issues.some((issue) => issue.severity === 'ERROR') ? 'ERROR' : file.issues.some((issue) => issue.severity === 'WARNING') ? 'WARNING' : 'OK';
          return html`<li class="preflight-item"><div><strong>${file.fileName}</strong><div class="small muted">${file.issues.length} incidencia(s) · ${file.blocking ? 'bloqueado' : 'no bloqueante'}</div></div><pw-status-chip tone=${this.severityTone(highest)} label=${highest}></pw-status-chip></li>`;
        })}</ul>
        <pw-button @click=${this.runPreflight}>Recalcular preflight</pw-button>
      </div>
    </pw-panel>`;
  }

  private renderExport() {
    const exportable = this.model.files.filter((file) => file.exportable);
    const errored = this.model.files.filter((file) => file.preflight?.blocking || file.generation?.status === 'error' || (file.errors?.length ?? 0) > 0);
    const ids = exportable.map((file) => file.id);
    return html`<pw-panel heading="Export" description="Archivos individuales, lote, ZIP y manifest de trazabilidad.">
      <div class="stack">
        <p class="export-note"><strong>${exportable.length} exportable(s)</strong> · ${errored.length} con error. Los archivos con error no impiden exportar los válidos.</p>
        <pw-button variant="primary" ?disabled=${exportable.length === 0} @click=${() => this.exportRequest('batch', ids)}>Exportar lote · ${exportable.length} válidos · ${errored.length} con error</pw-button>
        <pw-button ?disabled=${exportable.length === 0} @click=${() => this.exportRequest('zip', ids)}>Generar ZIP</pw-button>
        <div class="row"><pw-button ?disabled=${exportable.length === 0} @click=${() => this.manifestRequest('json', ids)}>Manifest JSON</pw-button><pw-button ?disabled=${exportable.length === 0} @click=${() => this.manifestRequest('csv', ids)}>Manifest CSV</pw-button></div>
        ${exportable.length === 0 ? html`<pw-empty-state heading="Sin archivos exportables" message="Los controles se habilitarán cuando el adaptador marque archivos como exportables."></pw-empty-state>` : html`<ul class="export-list" aria-label="Archivos individuales exportables">${exportable.map((file) => html`<li class="export-item"><div class="export-text"><strong>${file.fileName}</strong><span class="small muted">Listo para exportación individual</span></div><pw-button @click=${() => this.exportRequest('file', [file.id])}>Exportar</pw-button></li>`)}</ul>`}
      </div>
    </pw-panel>`;
  }

  private renderTracePrice(field: PriceField | undefined) {
    if (!field) return html`<span>Desconocido</span>`;
    if (field.state === 'unknown') return html`<span>Desconocido · ${field.reason}${field.provenance ? ` · raw ${String(field.provenance.raw ?? '')}` : ''}</span>`;
    return html`<span>${this.formatPrice(field)} · ${field.provenance.sourceId} · ${this.sourceLocText(field.provenance.loc)} · raw ${String(field.provenance.raw ?? '')}</span>`;
  }

  private renderTrace(file: WorkbenchFileView) {
    const trace = file.trace;
    if (!trace) return html`<pw-empty-state heading="Trazabilidad no disponible" message="El adaptador todavía no entregó provenance para este archivo."></pw-empty-state>`;
    const locations = trace.sources.flatMap((source) => source.locations.map((loc) => ({ sourceId: source.id, kind: source.kind, loc })));
    return html`<dl class="trace-grid">
      <dt>SVG fuente</dt><dd>${trace.sourceSvg.fileName}</dd>
      <dt>Fuente de precios</dt><dd>${file.sourceFileName ?? 'No informada'}</dd>
      <dt>Local raw</dt><dd>${trace.local.raw ?? 'No informado'}</dd>
      <dt>Local canónico</dt><dd>${trace.local.canonical ?? 'No informado'}</dd>
      <dt>Grupo raw</dt><dd>${file.rawGroup ?? 'No informado'}</dd>
      <dt>Canal</dt><dd>${file.channel ?? 'No informado'}</dd>
      <dt>Método</dt><dd>${trace.match.method ? this.matchMethodLabel(trace.match.method) : 'No informado'}</dd>
      <dt>Confianza</dt><dd>${trace.match.confidence !== undefined ? this.confidenceLabel(trace.match.confidence) : 'No informada'}</dd>
      <dt>Hash SVG</dt><dd>${trace.sourceSvg.hash ?? 'No informado'}</dd>
      <dt>Hash salida</dt><dd>${trace.hash ?? 'No informado'}</dd>
      <dt>ID estable</dt><dd>${trace.stableId ?? 'No informado'}</dd>
      <dt>NORMAL</dt><dd>${this.renderTracePrice(trace.pricing.normal)}</dd>
      <dt>ÉMINENT</dt><dd>${this.renderTracePrice(trace.pricing.eminent)}</dd>
    </dl>
    <section class="trace-section"><h3>Ubicaciones de fuente</h3>${locations.length === 0 ? html`<span class="small muted">Sin ubicaciones reportadas.</span>` : html`<ul class="trace-list">${locations.map((entry) => html`<li><strong>${entry.sourceId}</strong> · ${entry.kind}<div class="source-location">${this.sourceLocText(entry.loc)}</div></li>`)}</ul>`}</section>
    <section class="trace-section"><h3>Warnings</h3>${trace.warnings.length === 0 ? html`<span class="small muted">Sin warnings.</span>` : html`<ul class="trace-list">${trace.warnings.map((issue) => html`<li>${issue.code} · ${issue.message}</li>`)}</ul>`}</section>
    <section class="trace-section"><h3>Errors</h3>${trace.errors.length === 0 ? html`<span class="small muted">Sin errors.</span>` : html`<ul class="trace-list">${trace.errors.map((issue) => html`<li>${issue.code} · ${issue.message}</li>`)}</ul>`}</section>`;
  }

  private renderSelectedFile(file: WorkbenchFileView) {
    return html`<pw-panel heading="Archivo seleccionado" description="Revisión desacoplada de parsing, matching, pricing y generación.">
      <div class="stack">
        <div class="row-between"><div class="filename">${file.fileName}</div><div class="row"><pw-status-chip tone=${this.preflightTone(file)} label=${this.preflightLabel(file)}></pw-status-chip><pw-button @click=${this.openDetails}>Ver trazabilidad</pw-button></div></div>
        <div class="summary-grid">
          <div class="metric"><span class="metric-label">Local detectado</span><strong>${file.detectedLocal ?? 'Sin detectar'}</strong></div>
          <div class="metric"><span class="metric-label">Matching</span><strong>${this.fileMatchSummary(file)}</strong></div>
          <div class="metric"><span class="metric-label">Placeholder / precio</span><strong>${file.classification ?? 'Sin clasificar'}</strong></div>
        </div>
      </div>
    </pw-panel>
    <pw-panel heading="Revisión de matching" description="Las sugerencias aproximadas y ambigüedades requieren una elección humana.">${this.renderMatching(file)}</pw-panel>
    <pw-panel heading="Precios" description="NORMAL y ÉMINENT permanecen independientes; ausencia significa desconocido.">${this.renderPrices(file)}</pw-panel>
    <pw-panel heading="Incidencias visuales" description="Overflow, alineación y fuentes se muestran como diagnósticos accionables.">${this.renderLayoutIssues(file)}</pw-panel>
    <pw-panel heading="Preview" description="La UI recibe contenido ya procesado y no modifica el SVG.">${this.renderPreview(file)}</pw-panel>`;
  }

  override render() {
    const selected = this.selectedFile;
    const xlsEnabled = this.model.source.capabilities.xls;
    const fileItems = this.model.files.map((file) => ({
      id: file.id,
      primary: file.fileName,
      secondary: `${file.detectedLocal ?? 'Local sin detectar'} · ${this.fileMatchSummary(file)}`,
      meta: this.preflightLabel(file),
      selected: selected?.id === file.id,
    }));
    return html`<div class="app">
      <header class="topbar">
        <div><p class="eyebrow">Workbench local</p><h1>Actualización de precios en SVG</h1><p class="subtitle">Flujo por etapas para cargar fuentes locales, revisar matching y precios, validar preflight, comparar resultados y exportar sólo los archivos aptos.</p></div>
        <div class="top-actions"><pw-status-chip tone="info" label="Procesamiento local"></pw-status-chip>${this.model.progress ? html`<div style="min-width: 12rem"><pw-progress .value=${this.model.progress.value} .max=${this.model.progress.max} .label=${this.model.progress.label}></pw-progress></div>` : nothing}</div>
      </header>
      <nav class="stages" aria-label="Etapas del flujo">${STAGES.map((stage, index) => html`<div class="stage"><span class="stage-number" aria-hidden="true">${index + 1}</span><span>${stage}</span></div>`)}</nav>

      <pw-workbench-layout>
        <div slot="left" class="stack">
          <pw-panel heading="1. Fuente de precios" description="Carga local; W4 no parsea el archivo.">
            <div class="stack">
              <pw-file-dropzone accept=${`.csv,.xlsx${xlsEnabled ? ',.xls' : ''}`} status=${this.model.source.status} label="Cargar fuente local" helper=${`CSV, XLSX${xlsEnabled ? ', XLS' : ''}`} @files-selected=${this.onPriceSourceFiles}></pw-file-dropzone>
              ${this.model.source.fileName ? html`<div class="small"><strong>${this.model.source.fileName}</strong>${this.model.source.message ? html`<div class="muted">${this.model.source.message}</div>` : nothing}</div>` : nothing}
            </div>
          </pw-panel>

          <pw-panel heading="2. Archivos SVG" description="Admite múltiples archivos y conserva errores de forma aislada.">
            <div class="stack">
              <pw-file-dropzone accept=".svg,image/svg+xml" multiple status=${this.model.svgLoadStatus} label="Cargar SVG" helper="Seleccioná uno o varios archivos SVG" @files-selected=${this.onSvgFiles}></pw-file-dropzone>
              ${fileItems.length === 0 ? html`<pw-empty-state heading="Cola vacía" message="Los SVG aparecerán acá cuando el adaptador entregue sus view-models."></pw-empty-state>` : html`<pw-data-list .items=${fileItems} label="Cola de SVG" @item-activate=${this.onFileActivate}></pw-data-list>`}
            </div>
          </pw-panel>
          ${this.renderFonts()}
        </div>

        <div slot="center" class="stack">${selected ? this.renderSelectedFile(selected) : html`<pw-panel heading="Revisión"><pw-empty-state heading="Sin SVG seleccionados" message="Cargá archivos para habilitar matching, precios, preflight y preview."></pw-empty-state></pw-panel>`}</div>

        <div slot="right" class="stack">${this.renderPreflight()}${this.renderExport()}</div>
      </pw-workbench-layout>

      <pw-details-drawer .open=${this.ui.state.detailsOpen} heading=${selected ? `Provenance · ${selected.fileName}` : 'Provenance'} @drawer-close=${this.closeDetails}>${selected ? this.renderTrace(selected) : nothing}</pw-details-drawer>
    </div>`;
  }
}

customElements.define('pw-price-workbench', PriceWorkbench);
