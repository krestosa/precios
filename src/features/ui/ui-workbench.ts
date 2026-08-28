import { LitElement } from 'lit';
import '../../components';
import '../../layout/workbench-layout';
import '../../styles/tokens.css';
import type { DataListItem, FilesSelectedDetail, StatusTone, TabChangeDetail } from '../../components';
import type { MatchCandidate, PriceField, SourceLoc } from '../../domain/contracts';
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
  type PreviewMode,
  type WorkbenchFileView,
  type WorkbenchViewModel,
} from './models';
import {
  PREVIEW_TABS,
  exportTemplate,
  fontsTemplate,
  preflightTemplate,
  reviewTemplate,
  traceTemplate,
  workbenchShellTemplate,
} from './templates';
import { uiWorkbenchStyles } from './ui-workbench.styles';
import { WorkbenchUiStore } from './ui-store';

export class PriceWorkbench extends LitElement {
  static override properties = {
    model: { attribute: false },
  };

  static override styles = uiWorkbenchStyles;

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

  private preflightTone(file: WorkbenchFileView): StatusTone {
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

  private queueWarningCount(file: WorkbenchFileView): number {
    return (file.warnings?.length ?? 0) + (file.preflight?.issues.filter((issue) => issue.severity === 'WARNING').length ?? 0);
  }

  private queueErrorCount(file: WorkbenchFileView): number {
    return (file.errors?.length ?? 0) + (file.preflight?.issues.filter((issue) => issue.severity === 'ERROR').length ?? 0);
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

  private fontTone(status: FontUiStatus): StatusTone {
    if (status === 'installed' || status === 'uploaded') return 'success';
    if (status === 'mismatch') return 'warning';
    return 'danger';
  }

  private fontLabel(status: FontUiStatus): string {
    const labels: Record<FontUiStatus, string> = { installed: 'Instalada', uploaded: 'Cargada', missing: 'Faltante', mismatch: 'No coincide' };
    return labels[status];
  }

  override render() {
    const selected = this.selectedFile;
    const fileItems: readonly DataListItem[] = this.model.files.map((file) => ({
      id: file.id,
      primary: file.fileName,
      secondary: `${file.detectedLocal ?? 'Local sin detectar'} · ${this.fileMatchSummary(file)} · ${file.classification ?? 'Sin clasificar'} · Fuente: ${file.sourceFileName ?? 'no informada'}`,
      meta: `${this.preflightLabel(file)} · ${this.queueWarningCount(file)}W/${this.queueErrorCount(file)}E`,
      selected: selected?.id === file.id,
    }));

    const reviewContent = selected ? reviewTemplate({
      file: selected,
      selectedCandidate: this.ui.state.matchChoiceByFile[selected.id] ?? '',
      previewMode: this.ui.state.previewMode,
      zoom: this.ui.state.zoom,
      layoutIssues: this.derivedLayoutIssues(selected),
      preflightTone: this.preflightTone(selected),
      preflightLabel: this.preflightLabel(selected),
      matchSummary: this.fileMatchSummary(selected),
      formatPrice: (field) => this.formatPrice(field),
      priceReason: (field) => this.priceReason(field),
      sourceLocText: (loc) => this.sourceLocText(loc),
      matchMethodLabel: (method) => this.matchMethodLabel(method),
      confidenceLabel: (confidence) => this.confidenceLabel(confidence),
      onOpenDetails: () => this.openDetails(),
      onChooseMatch: (event) => this.chooseMatch(selected.id, event),
      onApplyMatch: (scope) => this.applyMatch(selected.id, scope),
      onIssueAction: (issue) => this.issueAction(selected.id, issue),
      onPreviewTabChange: (event) => this.onPreviewTabChange(event),
      onPreviewCommand: (command) => this.previewCommand(selected.id, command),
    }) : undefined;

    const traceContent = selected ? traceTemplate({
      file: selected,
      formatPrice: (field) => this.formatPrice(field),
      sourceLocText: (loc) => this.sourceLocText(loc),
      matchMethodLabel: (method) => this.matchMethodLabel(method),
      confidenceLabel: (confidence) => this.confidenceLabel(confidence),
    }) : undefined;

    return workbenchShellTemplate({
      model: this.model,
      selected,
      fileItems,
      reviewContent,
      fontsContent: fontsTemplate({
        fonts: this.model.fonts,
        loadStatus: this.model.fontLoadStatus,
        fontTone: (status) => this.fontTone(status),
        fontLabel: (status) => this.fontLabel(status),
        onFiles: (event) => this.onFontFiles(event),
      }),
      preflightContent: preflightTemplate(this.model, () => this.runPreflight()),
      exportContent: exportTemplate({
        files: this.model.files,
        onExport: (kind, fileIds) => this.exportRequest(kind, fileIds),
        onManifest: (format, fileIds) => this.manifestRequest(format, fileIds),
      }),
      traceContent,
      detailsOpen: this.ui.state.detailsOpen,
      onPriceSourceFiles: (event) => this.onPriceSourceFiles(event),
      onSvgFiles: (event) => this.onSvgFiles(event),
      onFileActivate: (event) => this.onFileActivate(event),
      onCloseDetails: () => this.closeDetails(),
    });
  }
}

customElements.define('pw-price-workbench', PriceWorkbench);
