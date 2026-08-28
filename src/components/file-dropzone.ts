import { LitElement, css, html } from 'lit';

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

  static override styles = css`
    :host { display: block; }
    .zone { display: grid; place-items: center; gap: 0.35rem; min-height: 7rem; border: 1.5px dashed var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, 0.625rem); padding: 1rem; text-align: center; background: var(--pw-color-canvas, #f4f6f8); transition: border-color var(--pw-motion-fast, 120ms) ease, background var(--pw-motion-fast, 120ms) ease; }
    .zone[data-drag='true'] { border-color: var(--pw-color-accent, #1859c9); background: #edf4ff; }
    .zone:focus-within { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 30%, transparent); outline-offset: 2px; }
    strong { font-size: var(--pw-font-size-md, 0.875rem); }
    small { color: var(--pw-color-ink-muted, #59636e); }
    input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; pointer-events: none; }
    label { display: inline-flex; margin-top: 0.35rem; border-radius: var(--pw-radius-sm, 0.375rem); padding: 0.45rem 0.7rem; color: var(--pw-color-accent, #1859c9); background: var(--pw-color-surface, #fff); border: 1px solid var(--pw-color-border, #d4dae0); font-weight: 650; cursor: pointer; }
    :host([disabled]) label { cursor: not-allowed; opacity: .55; }
    .state { font-size: var(--pw-font-size-sm, 0.75rem); font-weight: 650; }
    :host([status='error']) .state { color: var(--pw-color-danger, #b42318); }
    :host([status='ready']) .state { color: var(--pw-color-success, #166534); }
    @media (prefers-reduced-motion: reduce) { .zone { transition: none; } }
  `;

  accept = '';
  multiple = false;
  status: DropzoneStatus = 'empty';
  label = 'Seleccionar archivos';
  helper = '';
  disabled = false;
  private dragging = false;

  private emitFiles(files: FileList | readonly File[]) {
    const detail: FilesSelectedDetail = { files: Array.from(files) };
    this.dispatchEvent(new CustomEvent<FilesSelectedDetail>('files-selected', { detail, bubbles: true, composed: true }));
  }

  private onInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) this.emitFiles(input.files);
    input.value = '';
  }

  private onDragOver(event: DragEvent) {
    if (this.disabled) return;
    event.preventDefault();
    this.dragging = true;
    this.requestUpdate();
  }

  private onDragLeave() {
    this.dragging = false;
    this.requestUpdate();
  }

  private onDrop(event: DragEvent) {
    if (this.disabled) return;
    event.preventDefault();
    this.dragging = false;
    if (event.dataTransfer?.files.length) this.emitFiles(event.dataTransfer.files);
    this.requestUpdate();
  }

  override render() {
    const stateLabel = this.status === 'loading' ? 'Cargando' : this.status === 'ready' ? 'Listo' : this.status === 'error' ? 'Error' : 'Sin archivos';
    return html`<div class="zone" data-drag=${String(this.dragging)} @dragover=${this.onDragOver} @dragleave=${this.onDragLeave} @drop=${this.onDrop}>
      <strong>${this.label}</strong>
      ${this.helper ? html`<small>${this.helper}</small>` : null}
      <span class="state" aria-live="polite">Estado: ${stateLabel}</span>
      <label>
        Abrir selector
        <input type="file" .accept=${this.accept} ?multiple=${this.multiple} ?disabled=${this.disabled} @change=${this.onInput} />
      </label>
    </div>`;
  }
}

customElements.define('pw-file-dropzone', FileDropzone);
