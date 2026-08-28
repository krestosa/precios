import markup from './workbench-shell.html?raw';
import styles from './workbench-shell.css?raw';
import '../../../../components';
import '../../../../layout';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { DataListItem, ProgressBar } from '../../../../components';
import type { ResolutionDefaultsView, WorkbenchFileView, WorkbenchViewModel } from '../../models';
import type { WorkbenchUiState } from '../../ui-store';
import {
  actionLabel,
  actionMatchSummary,
  derivedLayoutIssues,
  effectiveChannel,
  effectiveLocal,
  formatPieceLabel,
  preflightLabel,
  processingLabel,
  queueErrorCount,
  queueWarningCount,
  resolutionBlocker,
  resolutionBlockerLabel,
  resolutionOptionLabel,
} from '../../presentation';
import type { SourceQueueTemplate } from '../source-queue';
import type { FontsTemplate } from '../fonts';
import type { ReviewTemplate } from '../review';
import type { PreflightTemplate } from '../preflight';
import type { ExportTemplate } from '../export';
import '../source-queue'; import '../fonts'; import '../review'; import '../preflight'; import '../export';

export interface WorkbenchShellView { readonly model: WorkbenchViewModel; readonly uiState: WorkbenchUiState; }

function queueSecondary(file: WorkbenchFileView, defaults: ResolutionDefaultsView | undefined): string {
  if (file.processingState === 'queued' || file.processingState === 'processing' || file.processingState === 'error') {
    return file.processingMessage ?? processingLabel(file.processingState);
  }
  const localOptions = file.localOptions ?? defaults?.localOptions ?? [];
  const channelOptions = file.channelOptions ?? defaults?.channelOptions ?? [];
  const local = resolutionOptionLabel(localOptions, effectiveLocal(file, defaults)) ?? 'Sin seleccionar';
  const channel = resolutionOptionLabel(channelOptions, effectiveChannel(file, defaults)) ?? 'Sin seleccionar';
  return `Acción: ${actionLabel(file)} · Formato/Pieza: ${formatPieceLabel(file)} · Local: ${local} · Canal: ${channel}`;
}

function queueMeta(file: WorkbenchFileView, defaults: ResolutionDefaultsView | undefined): string {
  const processing = processingLabel(file.processingState);
  if (file.processingState === 'queued' || file.processingState === 'processing' || file.processingState === 'error') return processing;
  const blocker = resolutionBlocker(file, defaults);
  return `Matching de acción: ${actionMatchSummary(file)} · Placeholder/precio: ${file.classification ?? 'Sin clasificar'} · ${resolutionBlockerLabel(blocker)} · ${preflightLabel(file)} · ${queueWarningCount(file)}W/${queueErrorCount(file)}E`;
}

export class WorkbenchShellTemplate extends HTMLElement {
  private readonly progress: ProgressBar;
  private readonly sourceQueue: SourceQueueTemplate;
  private readonly fonts: FontsTemplate;
  private readonly review: ReviewTemplate;
  private readonly preflight: PreflightTemplate;
  private readonly exportPanel: ExportTemplate;
  private viewValue: WorkbenchShellView | undefined;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.progress = requiredElement(root, '.progress'); this.sourceQueue = requiredElement(root, 'pw-source-queue-template'); this.fonts = requiredElement(root, 'pw-fonts-template');
    this.review = requiredElement(root, 'pw-review-template'); this.preflight = requiredElement(root, 'pw-preflight-template'); this.exportPanel = requiredElement(root, 'pw-export-template');
  }

  set view(value: WorkbenchShellView | undefined) { this.viewValue = value; this.sync(); }
  get view(): WorkbenchShellView | undefined { return this.viewValue; }
  connectedCallback(): void { upgradeProperty(this, 'view'); this.sync(); }

  private sync(): void {
    const view = this.viewValue; if (!view) return;
    const { model, uiState } = view;
    const selected = model.files.find((file) => file.id === uiState.selectedFileId) ?? model.files.find((file) => file.selected) ?? model.files[0];
    const items: readonly DataListItem[] = model.files.map((file) => ({
      id: file.id,
      primary: file.fileName,
      secondary: queueSecondary(file, model.resolutionDefaults),
      meta: queueMeta(file, model.resolutionDefaults),
      selected: selected?.id === file.id,
    }));
    this.sourceQueue.view = {
      source: model.source,
      ...(model.resolutionDefaults ? { resolutionDefaults: model.resolutionDefaults } : {}),
      svgLoadStatus: model.svgLoadStatus,
      items,
    };
    this.fonts.fonts = model.fonts; this.fonts.loadStatus = model.fontLoadStatus;
    this.review.file = selected; this.review.resolutionDefaults = model.resolutionDefaults; this.review.uiState = uiState; this.review.layoutIssues = selected ? derivedLayoutIssues(selected) : [];
    this.preflight.preflight = model.preflight; this.exportPanel.files = model.files;
    this.progress.hidden = !model.progress;
    if (model.progress) { this.progress.value = model.progress.value; this.progress.max = model.progress.max; this.progress.label = model.progress.label; }
  }
}

if (!customElements.get('pw-workbench-shell')) customElements.define('pw-workbench-shell', WorkbenchShellTemplate);
