import { html, nothing, type TemplateResult } from 'lit';
import type { DropzoneStatus } from './file-dropzone';

export interface FileDropzoneTemplateState {
  readonly accept: string;
  readonly multiple: boolean;
  readonly status: DropzoneStatus;
  readonly label: string;
  readonly helper: string;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly onInput: (event: Event) => void;
  readonly onDragOver: (event: DragEvent) => void;
  readonly onDragLeave: () => void;
  readonly onDrop: (event: DragEvent) => void;
}

export function fileDropzoneTemplate(state: FileDropzoneTemplateState): TemplateResult {
  const stateLabel = state.status === 'loading' ? 'Cargando' : state.status === 'ready' ? 'Listo' : state.status === 'error' ? 'Error' : 'Sin archivos';
  return html`<div class="zone" data-drag=${String(state.dragging)} @dragover=${state.onDragOver} @dragleave=${state.onDragLeave} @drop=${state.onDrop}>
    <slot name="icon"></slot>
    <strong>${state.label}</strong>
    ${state.helper ? html`<small>${state.helper}</small>` : nothing}
    <span class="state" aria-live="polite">Estado: ${stateLabel}</span>
    <label>
      Abrir selector
      <input type="file" .accept=${state.accept} ?multiple=${state.multiple} ?disabled=${state.disabled} @change=${state.onInput} />
    </label>
  </div>`;
}
