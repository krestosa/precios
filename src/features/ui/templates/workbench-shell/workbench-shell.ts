import markup from './workbench-shell.html?raw';
import styles from './workbench-shell.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { DataListItem, ProgressBar } from '../../../../components';
import type { WorkbenchFileView, WorkbenchViewModel } from '../../models';
import type { WorkbenchUiState } from '../../ui-store';
import { derivedLayoutIssues, fileMatchSummary, preflightLabel, processingLabel, queueErrorCount, queueWarningCount } from '../../presentation';
import type { SourceQueueTemplate } from '../source-queue';
import type { FontsTemplate } from '../fonts';
import type { ReviewTemplate } from '../review';
import type { PreflightTemplate } from '../preflight';
import type { ExportTemplate } from '../export';
import type { ResultsGalleryTemplate } from '../results-gallery';
import type { ProcessedCanvasTemplate } from '../processed-canvas';
import '../source-queue'; import '../fonts'; import '../review'; import '../preflight'; import '../export'; import '../results-gallery'; import '../processed-canvas';

export interface WorkbenchShellView { readonly model: WorkbenchViewModel; readonly uiState: WorkbenchUiState; }
type WorkspaceDestination = 'source' | 'results' | 'review' | 'validation' | 'export';

function queueSecondary(file: WorkbenchFileView): string {
  if (file.processingState === 'queued' || file.processingState === 'processing') {
    return [file.processingMessage ?? processingLabel(file.processingState), fileMatchSummary(file)].join(' · ');
  }
  if (file.processingState === 'error') return file.processingMessage ?? processingLabel(file.processingState);
  return [
    file.processingMessage,
    file.detectedLocal ?? 'Local sin detectar',
    fileMatchSummary(file),
    file.classification ?? 'Sin clasificar',
    `Fuente: ${file.sourceFileName ?? 'no informada'}`,
  ].filter((part): part is string => Boolean(part)).join(' · ');
}

function queueMeta(file: WorkbenchFileView): string {
  const processing = processingLabel(file.processingState);
  if (file.processingState === 'queued' || file.processingState === 'processing' || file.processingState === 'error') return processing;
  return `${processing} · ${preflightLabel(file)} · ${queueWarningCount(file)}W/${queueErrorCount(file)}E`;
}

export class WorkbenchShellTemplate extends HTMLElement {
  private readonly dashboard: HTMLElement;
  private readonly inspectorToggle: HTMLButtonElement;
  private readonly progress: ProgressBar;
  private readonly sourceQueue: SourceQueueTemplate;
  private readonly fonts: FontsTemplate;
  private readonly gallery: ResultsGalleryTemplate;
  private readonly canvas: ProcessedCanvasTemplate;
  private readonly review: ReviewTemplate;
  private readonly preflight: PreflightTemplate;
  private readonly exportPanel: ExportTemplate;
  private readonly railButtons: readonly HTMLButtonElement[];
  private viewValue: WorkbenchShellView | undefined;
  private activeDestination: WorkspaceDestination = 'source';
  private hadFiles = false;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.dashboard = requiredElement(root, '.dashboard');
    this.inspectorToggle = requiredElement(root, '.inspector-toggle');
    this.progress = requiredElement(root, '.progress');
    this.sourceQueue = requiredElement(root, 'pw-source-queue-template');
    this.fonts = requiredElement(root, 'pw-fonts-template');
    this.gallery = requiredElement(root, 'pw-results-gallery-template');
    this.canvas = requiredElement(root, 'pw-processed-canvas-template');
    this.review = requiredElement(root, 'pw-review-template');
    this.preflight = requiredElement(root, 'pw-preflight-template');
    this.exportPanel = requiredElement(root, 'pw-export-template');
    this.railButtons = [...root.querySelectorAll<HTMLButtonElement>('.rail-destination')];
    this.inspectorToggle.addEventListener('click', () => this.setInspectorOpen(!this.dashboard.classList.contains('inspector-open')));
    this.railButtons.forEach((button) => button.addEventListener('click', () => {
      const destination = button.dataset.destination;
      if (this.isDestination(destination)) this.navigate(destination);
    }));
  }

  set view(value: WorkbenchShellView | undefined) { this.viewValue = value; this.sync(); }
  get view(): WorkbenchShellView | undefined { return this.viewValue; }
  connectedCallback(): void { upgradeProperty(this, 'view'); this.sync(); }

  private isDestination(value: string | undefined): value is WorkspaceDestination {
    return value === 'source' || value === 'results' || value === 'review' || value === 'validation' || value === 'export';
  }

  private navigate(destination: WorkspaceDestination): void {
    this.setActiveDestination(destination);
    this.setInspectorOpen(destination !== 'results');
    const target = this.shadowRoot?.querySelector<HTMLElement>(`#${destination}-section`);
    if (target && 'scrollIntoView' in target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private setInspectorOpen(open: boolean): void {
    this.dashboard.classList.toggle('inspector-open', open);
    this.inspectorToggle.setAttribute('aria-expanded', String(open));
  }

  private setActiveDestination(destination: WorkspaceDestination): void {
    this.activeDestination = destination;
    this.railButtons.forEach((button) => {
      const selected = button.dataset.destination === destination;
      button.classList.toggle('selected', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  private sync(): void {
    const view = this.viewValue; if (!view) return;
    const { model, uiState } = view;
    const selected = model.files.find((file) => file.id === uiState.selectedFileId) ?? model.files.find((file) => file.selected) ?? model.files[0];
    const items: readonly DataListItem[] = model.files.map((file) => ({
      id: file.id,
      primary: file.fileName,
      secondary: queueSecondary(file),
      meta: queueMeta(file),
      selected: selected?.id === file.id,
    }));
    this.sourceQueue.view = { source: model.source, svgLoadStatus: model.svgLoadStatus, items };
    this.fonts.fonts = model.fonts; this.fonts.loadStatus = model.fontLoadStatus;
    this.gallery.files = model.files; this.gallery.selectedFileId = selected?.id;
    this.canvas.file = selected;
    this.review.file = selected; this.review.uiState = uiState; this.review.layoutIssues = selected ? derivedLayoutIssues(selected) : [];
    this.preflight.preflight = model.preflight; this.exportPanel.files = model.files;
    this.progress.hidden = !model.progress;
    if (model.progress) { this.progress.value = model.progress.value; this.progress.max = model.progress.max; this.progress.label = model.progress.label; }

    const hasFiles = model.files.length > 0;
    if (!this.hadFiles && hasFiles && this.activeDestination === 'source') {
      this.setActiveDestination('results');
      this.setInspectorOpen(false);
    }
    this.hadFiles = hasFiles;
  }
}

if (!customElements.get('pw-workbench-shell')) customElements.define('pw-workbench-shell', WorkbenchShellTemplate);
