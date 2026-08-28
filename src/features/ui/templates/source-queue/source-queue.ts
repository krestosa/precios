import markup from './source-queue.html?raw';
import styles from './source-queue.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement } from '../../../../components/shadow';
import type { DataList, DataListItem, FileDropzone, FilesSelectedDetail } from '../../../../components';
import type { PriceSourceView, UiLoadStatus } from '../../models';
import { emitUiTemplateEvent } from '../template-events';

export interface SourceQueueTemplateView {
  readonly source: PriceSourceView;
  readonly svgLoadStatus: UiLoadStatus;
  readonly items: readonly DataListItem[];
}

export class SourceQueueTemplate extends HTMLElement {
  private readonly sourceDropzone: FileDropzone;
  private readonly svgDropzone: FileDropzone;
  private readonly sourceFile: HTMLElement;
  private readonly sourceName: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly queue: DataList;
  private readonly queueEmpty: HTMLElement;
  private viewValue: SourceQueueTemplateView | undefined;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.sourceDropzone = requiredElement(root, '.source-dropzone');
    this.svgDropzone = requiredElement(root, '.svg-dropzone');
    this.sourceFile = requiredElement(root, '.source-file');
    this.sourceName = requiredElement(root, '.source-file strong');
    this.sourceMessage = requiredElement(root, '.source-file .message');
    this.queue = requiredElement(root, '.queue');
    this.queueEmpty = requiredElement(root, '.queue-empty');
    this.sourceDropzone.addEventListener('files-selected', (event) => emitUiTemplateEvent(this, 'ui:source-files', (event as CustomEvent<FilesSelectedDetail>).detail));
    this.svgDropzone.addEventListener('files-selected', (event) => emitUiTemplateEvent(this, 'ui:svg-files', (event as CustomEvent<FilesSelectedDetail>).detail));
    this.queue.addEventListener('item-activate', (event) => emitUiTemplateEvent(this, 'ui:file-activate', (event as CustomEvent<{ readonly id: string }>).detail));
  }

  get view(): SourceQueueTemplateView | undefined { return this.viewValue; }
  set view(value: SourceQueueTemplateView | undefined) { this.viewValue = value; this.sync(); }
  connectedCallback(): void { this.sync(); }

  private sync(): void {
    const view = this.viewValue;
    if (!view) return;
    const xlsEnabled = view.source.capabilities.xls;
    this.sourceDropzone.accept = `.csv,.xlsx${xlsEnabled ? ',.xls' : ''}`;
    this.sourceDropzone.helper = `CSV, XLSX${xlsEnabled ? ', XLS' : ''}`;
    this.sourceDropzone.status = view.source.status;
    this.svgDropzone.status = view.svgLoadStatus;
    this.sourceFile.hidden = !view.source.fileName;
    this.sourceName.textContent = view.source.fileName ?? '';
    this.sourceMessage.textContent = view.source.message ?? '';
    this.queue.items = view.items;
    this.queue.label = 'Cola de SVG';
    this.queue.hidden = view.items.length === 0;
    this.queueEmpty.hidden = view.items.length > 0;
  }
}

if (!customElements.get('pw-source-queue-template')) customElements.define('pw-source-queue-template', SourceQueueTemplate);
