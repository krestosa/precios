import markup from './file-dropzone.html?raw';
import styles from './file-dropzone.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export type DropzoneStatus = 'empty' | 'loading' | 'ready' | 'error';
export interface FilesSelectedDetail { readonly files: readonly File[]; }

export class FileDropzone extends HTMLElement {
  static get observedAttributes(): string[] { return ['accept', 'multiple', 'status', 'label', 'helper', 'disabled']; }

  private readonly zone: HTMLElement;
  private readonly labelNode: HTMLElement;
  private readonly helperNode: HTMLElement;
  private readonly stateNode: HTMLElement;
  private readonly input: HTMLInputElement;
  private dragging = false;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.zone = requiredElement(root, '.zone');
    this.labelNode = requiredElement(root, '.label');
    this.helperNode = requiredElement(root, '.helper');
    this.stateNode = requiredElement(root, '.state');
    this.input = requiredElement(root, 'input');
    this.input.addEventListener('change', () => {
      if (this.input.files?.length) this.emitFiles(this.input.files);
      this.input.value = '';
    });
    this.zone.addEventListener('dragover', (event) => this.onDragOver(event));
    this.zone.addEventListener('dragleave', () => this.setDragging(false));
    this.zone.addEventListener('drop', (event) => this.onDrop(event));
  }

  get accept(): string { return this.getAttribute('accept') ?? ''; }
  set accept(value: string) { this.setAttribute('accept', value); }
  get multiple(): boolean { return this.hasAttribute('multiple'); }
  set multiple(value: boolean) { this.toggleAttribute('multiple', value); }
  get status(): DropzoneStatus { return (this.getAttribute('status') as DropzoneStatus | null) ?? 'empty'; }
  set status(value: DropzoneStatus) { this.setAttribute('status', value); }
  get label(): string { return this.getAttribute('label') ?? 'Seleccionar archivos'; }
  set label(value: string) { this.setAttribute('label', value); }
  get helper(): string { return this.getAttribute('helper') ?? ''; }
  set helper(value: string) { this.setAttribute('helper', value); }
  get disabled(): boolean { return this.hasAttribute('disabled'); }
  set disabled(value: boolean) { this.toggleAttribute('disabled', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.labelNode.textContent = this.label;
    this.helperNode.textContent = this.helper;
    this.input.accept = this.accept;
    this.input.multiple = this.multiple;
    this.input.disabled = this.disabled;
    const labels: Record<DropzoneStatus, string> = { empty: 'Sin archivos', loading: 'Cargando', ready: 'Listo', error: 'Error' };
    this.stateNode.textContent = `Estado: ${labels[this.status]}`;
  }

  private setDragging(value: boolean): void { this.dragging = value; this.zone.dataset.drag = String(value); }
  private emitFiles(files: FileList | readonly File[]): void {
    this.dispatchEvent(new CustomEvent<FilesSelectedDetail>('files-selected', { detail: { files: Array.from(files) }, bubbles: true, composed: true }));
  }
  private onDragOver(event: DragEvent): void { if (this.disabled) return; event.preventDefault(); this.setDragging(true); }
  private onDrop(event: DragEvent): void { if (this.disabled) return; event.preventDefault(); this.setDragging(false); if (event.dataTransfer?.files.length) this.emitFiles(event.dataTransfer.files); }
}

if (!customElements.get('pw-file-dropzone')) customElements.define('pw-file-dropzone', FileDropzone);
