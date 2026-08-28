import markup from './export.html?raw';
import styles from './export.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement } from '../../../../components/shadow';
import type { UiButton } from '../../../../components';
import type { WorkbenchFileView } from '../../models';
import { emitUiTemplateEvent } from '../template-events';

export class ExportTemplate extends HTMLElement {
  private readonly note: HTMLElement;
  private readonly batch: UiButton;
  private readonly zip: UiButton;
  private readonly json: UiButton;
  private readonly csv: UiButton;
  private readonly empty: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private filesValue: readonly WorkbenchFileView[] = [];

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.note = requiredElement(root, '.note');
    this.batch = requiredElement(root, '.batch');
    this.zip = requiredElement(root, '.zip');
    this.json = requiredElement(root, '.manifest-json');
    this.csv = requiredElement(root, '.manifest-csv');
    this.empty = requiredElement(root, '.empty');
    this.list = requiredElement(root, '.export-list');
    this.itemTemplate = requiredElement(root, '.item-template');
    this.batch.addEventListener('click', () => this.emitExport('batch'));
    this.zip.addEventListener('click', () => this.emitExport('zip'));
    this.json.addEventListener('click', () => this.emitManifest('json'));
    this.csv.addEventListener('click', () => this.emitManifest('csv'));
  }

  set files(value: readonly WorkbenchFileView[]) { this.filesValue = value; this.sync(); }
  get files(): readonly WorkbenchFileView[] { return this.filesValue; }
  connectedCallback(): void { this.sync(); }

  private get exportable(): readonly WorkbenchFileView[] { return this.filesValue.filter((file) => file.exportable); }
  private get ids(): readonly string[] { return this.exportable.map((file) => file.id); }
  private emitExport(kind: 'batch' | 'zip'): void { emitUiTemplateEvent(this, 'ui:export-request', { kind, fileIds: this.ids }); }
  private emitManifest(manifestFormat: 'json' | 'csv'): void { emitUiTemplateEvent(this, 'ui:export-request', { kind: 'manifest', fileIds: this.ids, manifestFormat }); }

  private sync(): void {
    const exportable = this.exportable;
    const errored = this.filesValue.filter((file) => file.preflight?.blocking || file.generation?.status === 'error' || (file.errors?.length ?? 0) > 0);
    const disabled = exportable.length === 0;
    this.note.textContent = `${exportable.length} exportable(s) · ${errored.length} con error. Los archivos con error no impiden exportar los válidos.`;
    this.batch.disabled = disabled; this.batch.textContent = `Exportar lote · ${exportable.length} válidos · ${errored.length} con error`;
    this.zip.disabled = disabled; this.json.disabled = disabled; this.csv.disabled = disabled;
    this.empty.hidden = !disabled;
    this.list.hidden = disabled;
    this.list.replaceChildren();
    exportable.forEach((file) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'strong').textContent = file.fileName;
      const button = requiredElement<UiButton>(fragment, 'pw-button');
      button.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:export-request', { kind: 'file', fileIds: [file.id] }));
      this.list.append(fragment);
    });
  }
}

if (!customElements.get('pw-export-template')) customElements.define('pw-export-template', ExportTemplate);
