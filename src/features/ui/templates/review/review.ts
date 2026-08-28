import markup from './review.html?raw';
import styles from './review.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { MatchCandidate, PriceField } from '../../../../domain/contracts';
import type { SegmentedTabs, StatusChip, UiButton } from '../../../../components';
import type {
  LayoutIssueView,
  PreviewAsset,
  PreviewMode,
  PriceDisplayView,
  ResolutionDefaultsView,
  ResolutionOptionView,
  WorkbenchFileView,
} from '../../models';
import type { WorkbenchUiState } from '../../ui-store';
import {
  actionLabel,
  actionMatchSummary,
  confidenceLabel,
  effectiveActionMatchStatus,
  effectiveChannel,
  effectiveLocal,
  formatPieceLabel,
  matchMethodLabel,
  preflightLabel,
  preflightTone,
  priceDisplayReason,
  priceDisplayValue,
  resolutionBlocker,
  resolutionBlockerLabel,
  resolutionOptionLabel,
  sourceLocText,
} from '../../presentation';
import { emitUiTemplateEvent } from '../template-events';

const PREVIEW_TABS = [{ id: 'original', label: 'ORIGINAL' }, { id: 'result', label: 'RESULT' }, { id: 'overlay', label: 'OVERLAY' }] as const;

function resolutionOptionsSignature(options: readonly ResolutionOptionView[]): string {
  return JSON.stringify(options.map((option) => [option.value, option.label]));
}

export class ReviewTemplate extends HTMLElement {
  private readonly noFile: HTMLElement;
  private readonly reviewRoot: HTMLElement;
  private readonly filename: HTMLElement;
  private readonly resolutionStatus: StatusChip;
  private readonly preflight: StatusChip;
  private readonly details: UiButton;
  private readonly localField: HTMLElement;
  private readonly localSelect: HTMLSelectElement;
  private readonly localContext: HTMLElement;
  private readonly channelField: HTMLElement;
  private readonly channelSelect: HTMLSelectElement;
  private readonly channelContext: HTMLElement;
  private readonly resolutionMessage: HTMLElement;
  private readonly resolutionOptionTemplate: HTMLTemplateElement;
  private readonly matchEmpty: HTMLElement & { heading: string; message: string };
  private readonly matchResolved: HTMLElement;
  private readonly matchReview: HTMLElement;
  private readonly candidateList: HTMLUListElement;
  private readonly candidateTemplate: HTMLTemplateElement;
  private readonly optionTemplate: HTMLTemplateElement;
  private readonly select: HTMLSelectElement;
  private readonly applySession: UiButton;
  private readonly applyBatch: UiButton;
  private readonly issuesEmpty: HTMLElement;
  private readonly issueList: HTMLUListElement;
  private readonly issueTemplate: HTMLTemplateElement;
  private readonly tabs: SegmentedTabs;
  private readonly zoomNode: HTMLElement;
  private readonly previewEmpty: HTMLElement & { heading: string; message: string };
  private readonly viewport: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly iframe: HTMLIFrameElement;
  private readonly image: HTMLImageElement;
  private fileValue: WorkbenchFileView | undefined;
  private defaultsValue: ResolutionDefaultsView | undefined;
  private stateValue: WorkbenchUiState | undefined;
  private issuesValue: readonly LayoutIssueView[] = [];
  private localOptionsKey = '';
  private channelOptionsKey = '';

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.noFile = requiredElement(root, '.no-file'); this.reviewRoot = requiredElement(root, '.review'); this.filename = requiredElement(root, '.filename');
    this.resolutionStatus = requiredElement(root, '.resolution-status'); this.preflight = requiredElement(root, '.preflight'); this.details = requiredElement(root, '.details');
    this.localField = requiredElement(root, '.file-local-field'); this.localSelect = requiredElement(root, '.file-local'); this.localContext = requiredElement(root, '.file-local-context');
    this.channelField = requiredElement(root, '.file-channel-field'); this.channelSelect = requiredElement(root, '.file-channel'); this.channelContext = requiredElement(root, '.file-channel-context');
    this.resolutionMessage = requiredElement(root, '.resolution-message'); this.resolutionOptionTemplate = requiredElement(root, '.resolution-option-template');
    this.matchEmpty = requiredElement(root, '.match-empty'); this.matchResolved = requiredElement(root, '.match-resolved'); this.matchReview = requiredElement(root, '.match-review');
    this.candidateList = requiredElement(root, '.candidate-list'); this.candidateTemplate = requiredElement(root, '.candidate-template'); this.optionTemplate = requiredElement(root, '.option-template');
    this.select = requiredElement(root, '#candidate-select'); this.applySession = requiredElement(root, '.apply-session'); this.applyBatch = requiredElement(root, '.apply-batch');
    this.issuesEmpty = requiredElement(root, '.issues-empty'); this.issueList = requiredElement(root, '.issue-list'); this.issueTemplate = requiredElement(root, '.issue-template');
    this.tabs = requiredElement(root, '.preview-tabs'); this.zoomNode = requiredElement(root, '.zoom'); this.previewEmpty = requiredElement(root, '.preview-empty');
    this.viewport = requiredElement(root, '.preview-viewport'); this.previewContent = requiredElement(root, '.preview-content'); this.iframe = requiredElement(root, 'iframe'); this.image = requiredElement(root, 'img');
    this.details.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:details-open', {}));
    this.localSelect.addEventListener('change', () => this.emitLocalChoice());
    this.channelSelect.addEventListener('change', () => this.emitChannelChoice());
    this.select.addEventListener('change', () => this.emitChoice());
    this.applySession.addEventListener('click', () => this.emitApply('session'));
    this.applyBatch.addEventListener('click', () => this.emitApply('batch'));
    this.tabs.addEventListener('tab-change', (event) => { event.stopPropagation(); emitUiTemplateEvent(this, 'ui:preview-mode', { mode: (event as CustomEvent<{ readonly id: string }>).detail.id as PreviewMode }); });
    root.querySelectorAll<HTMLElement>('[data-command]').forEach((button) => button.addEventListener('click', () => {
      const file = this.fileValue; const command = button.dataset.command;
      if (file && (command === 'fit' || command === 'zoom-in' || command === 'zoom-out' || command === 'reset')) emitUiTemplateEvent(this, 'ui:preview-command', { fileId: file.id, command });
    }));
  }

  set file(value: WorkbenchFileView | undefined) { this.fileValue = value; this.sync(); }
  get file(): WorkbenchFileView | undefined { return this.fileValue; }
  set resolutionDefaults(value: ResolutionDefaultsView | undefined) { this.defaultsValue = value; this.sync(); }
  get resolutionDefaults(): ResolutionDefaultsView | undefined { return this.defaultsValue; }
  set uiState(value: WorkbenchUiState | undefined) { this.stateValue = value; this.sync(); }
  get uiState(): WorkbenchUiState | undefined { return this.stateValue; }
  set layoutIssues(value: readonly LayoutIssueView[]) { this.issuesValue = value; this.syncIssues(); }
  get layoutIssues(): readonly LayoutIssueView[] { return this.issuesValue; }
  connectedCallback(): void {
    upgradeProperty(this, 'file');
    upgradeProperty(this, 'resolutionDefaults');
    upgradeProperty(this, 'uiState');
    upgradeProperty(this, 'layoutIssues');
    this.sync();
  }

  private emitLocalChoice(): void {
    if (this.fileValue && this.localSelect.value) emitUiTemplateEvent(this, 'ui:local-select', { scope: 'file', fileId: this.fileValue.id, local: this.localSelect.value });
  }
  private emitChannelChoice(): void {
    if (this.fileValue && this.channelSelect.value) emitUiTemplateEvent(this, 'ui:channel-select', { scope: 'file', fileId: this.fileValue.id, channel: this.channelSelect.value });
  }
  private emitChoice(): void { if (this.fileValue) emitUiTemplateEvent(this, 'ui:match-choice', { fileId: this.fileValue.id, candidateId: this.select.value }); }
  private emitApply(scope: 'session' | 'batch'): void { if (this.fileValue && this.select.value) emitUiTemplateEvent(this, 'ui:match-apply', { fileId: this.fileValue.id, candidateId: this.select.value, scope }); }
  private setSummary(name: string, value: string): void { requiredElement<HTMLElement>(this.shadowRoot!, `[data-summary="${name}"]`).textContent = value; }

  private sync(): void {
    const file = this.fileValue;
    const state = this.stateValue;
    this.noFile.hidden = Boolean(file); this.reviewRoot.hidden = !file;
    if (!file || !state) return;

    const defaults = this.defaultsValue;
    const localOptions = file.localOptions ?? defaults?.localOptions ?? [];
    const channelOptions = file.channelOptions ?? defaults?.channelOptions ?? [];
    const local = effectiveLocal(file, defaults);
    const channel = effectiveChannel(file, defaults);
    const blocker = resolutionBlocker(file, defaults);

    this.filename.textContent = file.fileName;
    this.preflight.tone = preflightTone(file); this.preflight.label = preflightLabel(file);
    this.resolutionStatus.tone = blocker === null ? 'success' : blocker === 'action' || blocker === 'price' ? 'danger' : 'warning';
    this.resolutionStatus.label = resolutionBlockerLabel(blocker);
    this.setSummary('action', actionLabel(file));
    this.setSummary('format', formatPieceLabel(file));
    this.setSummary('local', resolutionOptionLabel(localOptions, local) ?? 'Sin seleccionar');
    this.setSummary('channel', resolutionOptionLabel(channelOptions, channel) ?? 'Sin seleccionar');
    this.setSummary('matching', actionMatchSummary(file));
    this.setSummary('classification', file.classification ?? 'Sin clasificar');

    this.syncResolutionControls(file, defaults, blocker, localOptions, channelOptions, local, channel);
    this.syncMatching(file, state.matchChoiceByFile[file.id] ?? '');
    this.syncPrice('.normal-value', '.normal-provenance', file.prices?.normalDisplay, file.prices?.normal, blocker);
    this.syncPrice('.eminent-value', '.eminent-provenance', file.prices?.eminentDisplay, file.prices?.eminent, blocker);
    this.syncValidation(file); this.syncIssues(); this.syncPreview(file, state.previewMode, state.zoom);
  }

  private syncResolutionOptions(select: HTMLSelectElement, options: readonly ResolutionOptionView[], key: string): string {
    const nextKey = resolutionOptionsSignature(options);
    if (nextKey === key) return key;
    while (select.options.length > 1) select.remove(1);
    options.forEach((item) => {
      const fragment = this.resolutionOptionTemplate.content.cloneNode(true) as DocumentFragment;
      const option = requiredElement<HTMLOptionElement>(fragment, 'option');
      option.value = item.value;
      option.textContent = item.label;
      select.append(fragment);
    });
    return nextKey;
  }

  private syncResolutionControls(
    file: WorkbenchFileView,
    defaults: ResolutionDefaultsView | undefined,
    blocker: ReturnType<typeof resolutionBlocker>,
    localOptions: readonly ResolutionOptionView[],
    channelOptions: readonly ResolutionOptionView[],
    local: string | undefined,
    channel: string | undefined,
  ): void {
    this.localOptionsKey = this.syncResolutionOptions(this.localSelect, localOptions, this.localOptionsKey);
    this.channelOptionsKey = this.syncResolutionOptions(this.channelSelect, channelOptions, this.channelOptionsKey);
    const showLocal = localOptions.length > 0 || blocker === 'local' || local !== undefined;
    const showChannel = channelOptions.length > 0 || blocker === 'channel' || channel !== undefined;
    this.localField.hidden = !showLocal;
    this.channelField.hidden = !showChannel;
    this.localSelect.disabled = localOptions.length === 0;
    this.channelSelect.disabled = channelOptions.length === 0;
    this.localSelect.value = local ?? '';
    this.channelSelect.value = channel ?? '';
    this.localContext.textContent = file.selectedLocal ? 'Override de este archivo.' : defaults?.selectedLocal ? 'Usando selección del lote.' : localOptions.length === 0 ? 'No hay opciones de local disponibles.' : '';
    this.channelContext.textContent = file.selectedChannel ? 'Override de este archivo.' : defaults?.selectedChannel ? 'Usando selección del lote.' : channelOptions.length === 0 ? 'No hay opciones de canal disponibles.' : '';
    this.resolutionMessage.textContent = resolutionBlockerLabel(blocker);
  }

  private syncMatching(file: WorkbenchFileView, selectedCandidate: string): void {
    const status = effectiveActionMatchStatus(file);
    const match = file.match;
    this.matchEmpty.hidden = true; this.matchResolved.hidden = true; this.matchReview.hidden = true;
    if (status === 'pending') {
      this.matchEmpty.hidden = false; this.matchEmpty.heading = 'Matching de acción pendiente'; this.matchEmpty.message = 'La acción todavía no fue resuelta por el runtime.'; return;
    }
    if (status === 'unmatched') {
      this.matchEmpty.hidden = false; this.matchEmpty.heading = 'Sin coincidencia'; this.matchEmpty.message = 'La acción no tiene una coincidencia resuelta. Local y canal se resolverán por separado después de elegir la acción.'; return;
    }
    if (status === 'matched') {
      this.matchResolved.hidden = false;
      requiredElement<HTMLElement>(this.shadowRoot!, '.match-meta').textContent = actionMatchSummary(file);
      requiredElement<HTMLElement>(this.shadowRoot!, '.match-label').textContent = `Acción: ${actionLabel(file)}`;
      requiredElement<HTMLElement>(this.shadowRoot!, '.match-canonical').textContent = match?.status === 'matched' ? match.selected.canonical ?? '' : '';
      return;
    }
    if (!match || (match.status !== 'suggestion' && match.status !== 'ambiguous')) {
      this.matchEmpty.hidden = false;
      this.matchEmpty.heading = 'Revisión de acción requerida';
      this.matchEmpty.message = status === 'suggestion' ? 'El runtime reportó una sugerencia de acción que requiere confirmación.' : 'El runtime reportó una acción ambigua que requiere confirmación.';
      return;
    }
    this.matchReview.hidden = false;
    const isSuggestion = match.status === 'suggestion';
    const warning = requiredElement<StatusChip>(this.shadowRoot!, '.match-warning'); warning.label = isSuggestion ? 'Sugerencia; requiere revisión' : 'Ambigüedad; requiere revisión';
    requiredElement<HTMLElement>(this.shadowRoot!, '.match-confidence').textContent = isSuggestion ? `Confianza ${confidenceLabel(match.confidence)}. No se aplica automáticamente.` : '';
    this.renderCandidates(match.candidates, selectedCandidate);
  }

  private renderCandidates(candidates: readonly MatchCandidate[], selectedCandidate: string): void {
    this.candidateList.replaceChildren();
    while (this.select.options.length > 1) this.select.remove(1);
    candidates.forEach((candidate) => {
      const fragment = this.candidateTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'strong').textContent = candidate.label;
      requiredElement<HTMLElement>(fragment, '.candidate-meta').textContent = `${matchMethodLabel(candidate.method)} · ${confidenceLabel(candidate.confidence)}`;
      requiredElement<HTMLElement>(fragment, '.candidate-canonical').textContent = candidate.canonical ?? '';
      this.candidateList.append(fragment);
      const optionFragment = this.optionTemplate.content.cloneNode(true) as DocumentFragment;
      const option = requiredElement<HTMLOptionElement>(optionFragment, 'option'); option.value = candidate.id; option.textContent = `${candidate.label} · ${confidenceLabel(candidate.confidence)}`; this.select.append(optionFragment);
    });
    this.select.value = selectedCandidate; const disabled = selectedCandidate.length === 0; this.applySession.disabled = disabled; this.applyBatch.disabled = disabled;
  }

  private syncPrice(valueSelector: string, provenanceSelector: string, display: PriceDisplayView | undefined, field: PriceField | undefined, blocker: ReturnType<typeof resolutionBlocker>): void {
    const selectionBlocked = blocker === 'action' || blocker === 'local' || blocker === 'channel';
    const effectiveDisplay: PriceDisplayView | undefined = display ?? (selectionBlocked ? { state: 'selection-required', message: resolutionBlockerLabel(blocker) } : undefined);
    const value = requiredElement<HTMLElement>(this.shadowRoot!, valueSelector);
    value.textContent = priceDisplayValue(effectiveDisplay, field);
    value.classList.toggle('unknown', effectiveDisplay?.state !== 'resolved' || field?.state !== 'known');
    const provenance = requiredElement<HTMLElement>(this.shadowRoot!, provenanceSelector);
    provenance.textContent = `${priceDisplayReason(effectiveDisplay, field)}${field?.provenance ? `\nFuente: ${field.provenance.sourceId} · ${field.provenance.sourceKind}\n${sourceLocText(field.provenance.loc)}` : ''}`;
  }

  private syncValidation(file: WorkbenchFileView): void {
    const node = requiredElement<HTMLElement>(this.shadowRoot!, '.validation'); const validation = file.prices?.discount25;
    node.classList.toggle('warning', validation?.status === 'mismatch');
    if (!validation) { node.textContent = 'Validación 25% todavía no reportada. No se infiere ningún precio.'; return; }
    const parts = [`Validación 25%: ${validation.status}${validation.message ? ` · ${validation.message}` : ''}`];
    if (validation.expectedEminent !== undefined) parts.push(`Valor esperado para validar: ${new Intl.NumberFormat().format(validation.expectedEminent)}${validation.difference !== undefined ? ` · diferencia ${new Intl.NumberFormat().format(validation.difference)}` : ''}`);
    parts.push('Esta validación es informativa y no sustituye el valor ÉMINENT.'); node.textContent = parts.join(' ');
  }

  private syncIssues(): void {
    const file = this.fileValue; if (!file) return;
    this.issuesEmpty.hidden = this.issuesValue.length > 0; this.issueList.hidden = this.issuesValue.length === 0; this.issueList.replaceChildren();
    this.issuesValue.forEach((issue) => {
      const fragment = this.issueTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'strong').textContent = issue.kind === 'overflow' ? 'Overflow' : issue.kind === 'alignment' ? 'Alineación' : 'Fuente faltante';
      requiredElement<HTMLElement>(fragment, 'span').textContent = `${issue.severity} · ${issue.message}`;
      const button = requiredElement<UiButton>(fragment, 'pw-button'); button.textContent = issue.actionLabel; button.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:issue-action', { fileId: file.id, issueId: issue.id, kind: issue.kind })); this.issueList.append(fragment);
    });
  }

  private syncPreview(file: WorkbenchFileView, mode: PreviewMode, zoom: number): void {
    this.tabs.items = PREVIEW_TABS; this.tabs.selected = mode; this.tabs.label = 'Vista de SVG'; this.zoomNode.textContent = `${Math.round(zoom * 100)}%`; this.previewContent.style.setProperty('--pw-preview-scale', String(zoom));
    const preview = file.preview; const asset = mode === 'original' ? preview?.original : mode === 'result' ? preview?.result : preview?.overlay;
    if (preview?.status === 'error') { this.showPreviewEmpty('Error de preview', preview.message ?? 'El procesador reportó un error para esta vista.'); return; }
    if (!asset) { this.showPreviewEmpty('Preview no disponible', 'Esta vista todavía no recibió contenido procesado.'); return; }
    this.previewEmpty.hidden = true; this.viewport.hidden = false; this.showAsset(asset, file);
  }

  private showPreviewEmpty(heading: string, message: string): void { this.previewEmpty.heading = heading; this.previewEmpty.message = message; this.previewEmpty.hidden = false; this.viewport.hidden = true; }
  private showAsset(asset: PreviewAsset, file: WorkbenchFileView): void {
    const label = asset.label ?? `Preview de ${file.fileName}`;
    if (asset.kind === 'markup') { this.image.hidden = true; this.image.removeAttribute('src'); this.iframe.hidden = false; this.iframe.title = label; this.iframe.srcdoc = asset.value; }
    else { this.iframe.hidden = true; this.iframe.removeAttribute('srcdoc'); this.image.hidden = false; this.image.alt = label; this.image.src = asset.value; }
  }
}

if (!customElements.get('pw-review-template')) customElements.define('pw-review-template', ReviewTemplate);
