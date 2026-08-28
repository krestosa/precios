import markup from './workbench.html?raw';
import styles from './workbench.css?raw';
import '../../../components';
import '../../../layout';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../components/shadow';
import type { DetailsDrawer } from '../../../components';
import { dispatchWorkbenchEvent, type PreviewCommand } from '../events';
import { EMPTY_WORKBENCH_MODEL, type PreviewMode, type WorkbenchFileView, type WorkbenchViewModel } from '../models';
import { WorkbenchUiStore, type WorkbenchUiState } from '../ui-store';
import type { UiTemplateEventMap, WorkbenchShellTemplate, TraceTemplate } from '../templates';
import '../templates';

export class PriceWorkbench extends HTMLElement {
  private readonly shell: WorkbenchShellTemplate;
  private readonly drawer: DetailsDrawer;
  private readonly trace: TraceTemplate;
  private readonly ui = new WorkbenchUiStore();
  private modelValue: WorkbenchViewModel = EMPTY_WORKBENCH_MODEL;
  private stateRevision = 0;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.shell = requiredElement(root, 'pw-workbench-shell');
    this.drawer = requiredElement(root, 'pw-details-drawer');
    this.trace = requiredElement(root, 'pw-trace-template');
    this.bindEvents();
    this.drawer.addEventListener('drawer-close', (event) => { event.stopPropagation(); this.ui.setDetailsOpen(false); this.refresh(); });
  }

  get model(): WorkbenchViewModel { return this.modelValue; }
  set model(value: WorkbenchViewModel) { this.modelValue = value; this.refresh(); }
  get uiState(): WorkbenchUiState { return this.ui.state; }
  connectedCallback(): void { upgradeProperty(this, 'model'); this.refresh(); }

  private get selectedFile(): WorkbenchFileView | undefined {
    const id = this.ui.state.selectedFileId;
    return this.modelValue.files.find((file) => file.id === id) ?? this.modelValue.files.find((file) => file.selected) ?? this.modelValue.files[0];
  }

  private bindEvents(): void {
    this.onUi('ui:source-files', (detail) => dispatchWorkbenchEvent(this, 'pw:price-source-files', detail));
    this.onUi('ui:sheet-select', (detail) => dispatchWorkbenchEvent(this, 'pw:sheet-select', detail));
    this.onUi('ui:svg-files', (detail) => dispatchWorkbenchEvent(this, 'pw:svg-files', detail));
    this.onUi('ui:font-files', (detail) => dispatchWorkbenchEvent(this, 'pw:font-files', detail));
    this.onUi('ui:file-activate', (detail) => { this.ui.selectFile(detail.id); this.refresh(); });
    this.onUi('ui:match-choice', (detail) => { this.ui.chooseMatch(detail.fileId, detail.candidateId); this.refresh(); });
    this.onUi('ui:match-apply', (detail) => dispatchWorkbenchEvent(this, 'pw:match-apply', detail));
    this.onUi('ui:preview-mode', (detail) => { if (this.isPreviewMode(detail.mode)) { this.ui.setPreviewMode(detail.mode); this.refresh(); } });
    this.onUi('ui:preview-command', (detail) => this.handlePreviewCommand(detail.fileId, detail.command));
    this.onUi('ui:issue-action', (detail) => dispatchWorkbenchEvent(this, 'pw:issue-action', detail));
    this.onUi('ui:preflight-request', () => dispatchWorkbenchEvent(this, 'pw:preflight-request', { fileIds: this.modelValue.files.map((file) => file.id) }));
    this.onUi('ui:export-request', (detail) => dispatchWorkbenchEvent(this, 'pw:export-request', detail));
    this.onUi('ui:details-open', () => { this.ui.setDetailsOpen(true); this.refresh(); });
    this.onUi('ui:reset', () => this.resetFlow());
  }

  private onUi<Name extends keyof UiTemplateEventMap>(name: Name, handler: (detail: UiTemplateEventMap[Name]) => void): void {
    this.addEventListener(name, (event) => { event.stopPropagation(); handler((event as CustomEvent<UiTemplateEventMap[Name]>).detail); });
  }

  private isPreviewMode(value: string): value is PreviewMode { return value === 'original' || value === 'result' || value === 'overlay'; }

  private resetFlow(): void {
    this.ui.reset();
    this.modelValue = EMPTY_WORKBENCH_MODEL;
    this.refresh();
    dispatchWorkbenchEvent(this, 'pw:reset-request', {});
  }

  private handlePreviewCommand(fileId: string, command: PreviewCommand): void {
    if (command === 'zoom-in') this.ui.zoomIn();
    if (command === 'zoom-out') this.ui.zoomOut();
    if (command === 'reset' || command === 'fit') this.ui.resetZoom();
    this.refresh();
    dispatchWorkbenchEvent(this, 'pw:preview-command', { fileId, command, zoom: this.ui.state.zoom });
  }

  private refresh(): void {
    this.shell.view = { model: this.modelValue, uiState: this.ui.state };
    const selected = this.selectedFile;
    this.drawer.open = this.ui.state.detailsOpen;
    this.drawer.heading = selected ? `Provenance · ${selected.fileName}` : 'Provenance';
    this.trace.file = selected;
    this.stateRevision += 1;
    dispatchWorkbenchEvent(this, 'pw:state-change', { revision: this.stateRevision });
  }
}

if (!customElements.get('pw-price-workbench')) customElements.define('pw-price-workbench', PriceWorkbench);
