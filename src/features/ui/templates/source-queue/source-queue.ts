import markup from './source-queue.html?raw';
import styles from './source-queue.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { DataList, DataListItem, FileDropzone, FilesSelectedDetail, StatusChip } from '../../../../components';
import type { PriceSourceView, UiLoadStatus, WorkbookSheetView } from '../../models';
import { emitUiTemplateEvent } from '../template-events';

export interface SourceQueueTemplateView {
  readonly source: PriceSourceView;
  readonly svgLoadStatus: UiLoadStatus;
  readonly items: readonly DataListItem[];
}

type SheetTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function sheetOptionLabel(sheet: WorkbookSheetView): string {
  const visibility = sheet.visibility === 'hidden' ? ' · Oculta' : sheet.visibility === 'veryHidden' ? ' · Muy oculta' : '';
  const support = sheet.supportStatus === 'unsupported' ? ' · Estructura no compatible' : '';
  return `${sheet.name}${visibility}${support}`;
}

function sheetOptionsSignature(sheets: readonly WorkbookSheetView[]): string {
  return JSON.stringify(sheets.map((sheet) => [sheet.index, sheet.name, sheet.visibility, sheet.supportStatus ?? 'unknown']));
}

function sourceLoadStatus(source: PriceSourceView): UiLoadStatus {
  if (source.sheetSelectionRequired && !source.selectedSheetName) return 'loading';
  if (source.sheetProcessingState === 'queued' || source.sheetProcessingState === 'processing') return 'loading';
  const selected = source.sheets?.find((sheet) => sheet.name === source.selectedSheetName);
  if (selected?.supportStatus === 'unsupported' || source.sheetProcessingState === 'error') return 'error';
  return source.status;
}

function sheetState(source: PriceSourceView, selected: WorkbookSheetView | undefined): { readonly tone: SheetTone; readonly label: string } {
  if (!source.selectedSheetName) {
    return source.sheetSelectionRequired
      ? { tone: 'warning', label: 'Falta elegir hoja' }
      : { tone: 'neutral', label: 'Hoja sin seleccionar' };
  }
  if (selected?.supportStatus === 'unsupported' || source.sheetProcessingState === 'error') return { tone: 'danger', label: 'Error de estructura en esta hoja' };
  if (source.sheetProcessingState === 'processing') return { tone: 'info', label: 'Procesando hoja' };
  if (source.sheetProcessingState === 'queued') return { tone: 'neutral', label: 'Hoja en cola' };
  if (source.sheetProcessingState === 'warning') return { tone: 'warning', label: 'Hoja lista con advertencias' };
  if (source.sheetProcessingState === 'ready') return { tone: 'success', label: 'Hoja lista' };
  return { tone: 'neutral', label: 'Hoja seleccionada' };
}

export class SourceQueueTemplate extends HTMLElement {
  private readonly sourceDropzone: FileDropzone;
  private readonly svgDropzone: FileDropzone;
  private readonly sourceFile: HTMLElement;
  private readonly sourceName: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly sheetSelector: HTMLElement;
  private readonly sheetSelect: HTMLSelectElement;
  private readonly sheetOptionTemplate: HTMLTemplateElement;
  private readonly sheetSuggestion: HTMLElement;
  private readonly sheetStatus: StatusChip;
  private readonly sheetMessage: HTMLElement;
  private readonly sheetSummary: HTMLElement;
  private readonly sheetWarnings: HTMLElement;
  private readonly queue: DataList;
  private readonly queueEmpty: HTMLElement;
  private viewValue: SourceQueueTemplateView | undefined;
  private sheetOptionsKey = '';

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.sourceDropzone = requiredElement(root, '.source-dropzone');
    this.svgDropzone = requiredElement(root, '.svg-dropzone');
    this.sourceFile = requiredElement(root, '.source-file');
    this.sourceName = requiredElement(root, '.source-file strong');
    this.sourceMessage = requiredElement(root, '.source-file .message');
    this.sheetSelector = requiredElement(root, '.sheet-selector');
    this.sheetSelect = requiredElement(root, '.sheet-select');
    this.sheetOptionTemplate = requiredElement(root, '.sheet-option-template');
    this.sheetSuggestion = requiredElement(root, '.sheet-suggestion');
    this.sheetStatus = requiredElement(root, '.sheet-status');
    this.sheetMessage = requiredElement(root, '.sheet-message');
    this.sheetSummary = requiredElement(root, '.sheet-summary');
    this.sheetWarnings = requiredElement(root, '.sheet-warnings');
    this.queue = requiredElement(root, '.queue');
    this.queueEmpty = requiredElement(root, '.queue-empty');
    this.sourceDropzone.addEventListener('files-selected', (event) => { event.stopPropagation(); emitUiTemplateEvent(this, 'ui:source-files', (event as CustomEvent<FilesSelectedDetail>).detail); });
    this.svgDropzone.addEventListener('files-selected', (event) => { event.stopPropagation(); emitUiTemplateEvent(this, 'ui:svg-files', (event as CustomEvent<FilesSelectedDetail>).detail); });
    this.sheetSelect.addEventListener('change', () => { if (this.sheetSelect.value) emitUiTemplateEvent(this, 'ui:sheet-select', { sheetName: this.sheetSelect.value }); });
    this.queue.addEventListener('item-activate', (event) => { event.stopPropagation(); emitUiTemplateEvent(this, 'ui:file-activate', (event as CustomEvent<{ readonly id: string }>).detail); });
  }

  get view(): SourceQueueTemplateView | undefined { return this.viewValue; }
  set view(value: SourceQueueTemplateView | undefined) { this.viewValue = value; this.sync(); }
  connectedCallback(): void { upgradeProperty(this, 'view'); this.sync(); }

  private sync(): void {
    const view = this.viewValue;
    if (!view) return;
    const xlsEnabled = view.source.capabilities.xls;
    this.sourceDropzone.accept = `.csv,.xlsx${xlsEnabled ? ',.xls' : ''}`;
    this.sourceDropzone.helper = `CSV, XLSX${xlsEnabled ? ', XLS' : ''}`;
    this.sourceDropzone.status = sourceLoadStatus(view.source);
    this.svgDropzone.status = view.svgLoadStatus;
    this.sourceFile.hidden = !view.source.fileName;
    this.sourceName.textContent = view.source.fileName ?? '';
    this.sourceMessage.textContent = view.source.message ?? '';
    this.syncSheetSelector(view.source);
    this.queue.items = view.items;
    this.queue.label = 'Cola de SVG';
    this.queue.hidden = view.items.length === 0;
    this.queueEmpty.hidden = view.items.length > 0;
  }

  private syncSheetOptions(sheets: readonly WorkbookSheetView[]): void {
    const nextKey = sheetOptionsSignature(sheets);
    if (nextKey === this.sheetOptionsKey) return;
    while (this.sheetSelect.options.length > 1) this.sheetSelect.remove(1);
    sheets.forEach((sheet) => {
      const fragment = this.sheetOptionTemplate.content.cloneNode(true) as DocumentFragment;
      const option = requiredElement<HTMLOptionElement>(fragment, 'option');
      option.value = sheet.name;
      option.textContent = sheetOptionLabel(sheet);
      this.sheetSelect.append(fragment);
    });
    this.sheetOptionsKey = nextKey;
  }

  private clearSheetSelector(): void {
    this.sheetOptionsKey = '';
    while (this.sheetSelect.options.length > 1) this.sheetSelect.remove(1);
    this.sheetSelect.value = '';
    this.sheetSuggestion.hidden = true;
    this.sheetSuggestion.textContent = '';
    this.sheetStatus.tone = 'neutral';
    this.sheetStatus.label = '';
    this.sheetMessage.hidden = true;
    this.sheetMessage.textContent = '';
    this.sheetSummary.hidden = true;
    this.sheetSummary.textContent = '';
    this.sheetWarnings.hidden = true;
    this.sheetWarnings.textContent = '';
  }

  private syncSheetSelector(source: PriceSourceView): void {
    const sheets = source.sheets ?? [];
    this.sheetSelector.hidden = sheets.length === 0;
    if (sheets.length === 0) {
      this.clearSheetSelector();
      return;
    }

    this.syncSheetOptions(sheets);
    this.sheetSelect.value = source.selectedSheetName ?? '';

    this.sheetSuggestion.hidden = !source.suggestedSheetName;
    this.sheetSuggestion.textContent = source.suggestedSheetName ? `Sugerida: ${source.suggestedSheetName}` : '';

    const selected = sheets.find((sheet) => sheet.name === source.selectedSheetName);
    const state = sheetState(source, selected);
    this.sheetStatus.tone = state.tone;
    this.sheetStatus.label = state.label;

    const defaultMessage = source.sheetSelectionRequired && !source.selectedSheetName
      ? 'Archivo aceptado. Seleccioná la hoja de datos para continuar.'
      : selected?.supportStatus === 'unsupported'
        ? 'La hoja seleccionada no tiene una estructura compatible. Podés elegir otra sin volver a cargar el archivo.'
        : '';
    const message = source.sheetMessage ?? selected?.message ?? defaultMessage;
    this.sheetMessage.hidden = message.length === 0;
    this.sheetMessage.textContent = message;

    const canShowSummary = Boolean(
      source.selectedSheetName
      && source.selectedSheetSummary
      && source.sheetProcessingState !== 'queued'
      && source.sheetProcessingState !== 'processing'
      && source.sheetProcessingState !== 'error'
      && selected?.supportStatus !== 'unsupported',
    );
    this.sheetSummary.hidden = !canShowSummary;
    this.sheetWarnings.hidden = !canShowSummary || (source.selectedSheetSummary?.warnings?.length ?? 0) === 0;
    if (canShowSummary && source.selectedSheetSummary) {
      const summary = source.selectedSheetSummary;
      const eminent = summary.eminentGroupCount === undefined ? 'ÉMINENT no detectado' : `${summary.eminentGroupCount} grupos ÉMINENT`;
      this.sheetSummary.textContent = `${summary.rowCount} filas · ${summary.columnCount} columnas · ${summary.normalGroupCount} grupos NORMAL · ${eminent}`;
      this.sheetWarnings.textContent = summary.warnings?.length ? `Advertencias: ${summary.warnings.join(' · ')}` : '';
    } else {
      this.sheetSummary.textContent = '';
      this.sheetWarnings.textContent = '';
    }
  }
}

if (!customElements.get('pw-source-queue-template')) customElements.define('pw-source-queue-template', SourceQueueTemplate);
