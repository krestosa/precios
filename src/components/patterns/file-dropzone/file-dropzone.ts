import { LitElement } from 'lit';
import { fileDropzoneStyles } from './file-dropzone.styles';
import { fileDropzoneTemplate } from './file-dropzone.template';

export type DropzoneStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface FilesSelectedDetail {
  readonly files: readonly File[];
}

export class FileDropzone extends LitElement {
  static override properties = {
    accept: { type: String },
    multiple: { type: Boolean, reflect: true },
    status: { type: String, reflect: true },
    label: { type: String },
    helper: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  static override styles = fileDropzoneStyles;

  accept = '';
  multiple = false;
  status: DropzoneStatus = 'empty';
  label = 'Seleccionar archivos';
  helper = '';
  disabled = false;
  private dragging = false;

  private emitFiles(files: FileList | readonly File[]): void {
    const detail: FilesSelectedDetail = { files: Array.from(files) };
    this.dispatchEvent(new CustomEvent<FilesSelectedDetail>('files-selected', { detail, bubbles: true, composed: true }));
  }

  private onInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) this.emitFiles(input.files);
    input.value = '';
  }

  private onDragOver(event: DragEvent): void {
    if (this.disabled) return;
    event.preventDefault();
    this.dragging = true;
    this.requestUpdate();
  }

  private onDragLeave(): void {
    this.dragging = false;
    this.requestUpdate();
  }

  private onDrop(event: DragEvent): void {
    if (this.disabled) return;
    event.preventDefault();
    this.dragging = false;
    if (event.dataTransfer?.files.length) this.emitFiles(event.dataTransfer.files);
    this.requestUpdate();
  }

  override render() {
    return fileDropzoneTemplate({
      accept: this.accept,
      multiple: this.multiple,
      status: this.status,
      label: this.label,
      helper: this.helper,
      disabled: this.disabled,
      dragging: this.dragging,
      onInput: (event) => this.onInput(event),
      onDragOver: (event) => this.onDragOver(event),
      onDragLeave: () => this.onDragLeave(),
      onDrop: (event) => this.onDrop(event),
    });
  }
}

customElements.define('pw-file-dropzone', FileDropzone);
