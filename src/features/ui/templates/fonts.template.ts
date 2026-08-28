import { html, type TemplateResult } from 'lit';
import type { FilesSelectedDetail, StatusTone } from '../../../components';
import type { FontUiStatus, FontView, UiLoadStatus } from '../models';

export interface FontsTemplateState {
  readonly fonts: readonly FontView[];
  readonly loadStatus: UiLoadStatus;
  readonly fontTone: (status: FontUiStatus) => StatusTone;
  readonly fontLabel: (status: FontUiStatus) => string;
  readonly onFiles: (event: CustomEvent<FilesSelectedDetail>) => void;
}

export function fontsTemplate(state: FontsTemplateState): TemplateResult {
  return html`<pw-panel heading="Fuentes requeridas" description="W4 sólo entrega archivos al resolver tipográfico; no interpreta metadata.">
    <div class="stack">
      ${state.fonts.length === 0 ? html`<pw-empty-state heading="Sin requisitos reportados" message="El motor todavía no informó fuentes requeridas."></pw-empty-state>` : html`<ul class="font-list" aria-label="Fuentes requeridas">${state.fonts.map((font) => html`<li class="font-item"><div class="font-text"><strong>${font.record.spec.family}</strong><span class="small muted">Peso ${font.record.spec.weight} · ${font.record.spec.style}${font.requiredBy?.length ? ` · ${font.requiredBy.length} archivo(s)` : ''}</span></div><pw-status-chip tone=${state.fontTone(font.uiStatus)} label=${state.fontLabel(font.uiStatus)}></pw-status-chip></li>`)}</ul>`}
      <pw-file-dropzone accept=".ttf,.otf,.woff,.woff2" multiple status=${state.loadStatus} label="Agregar fuentes locales" helper="TTF, OTF, WOFF o WOFF2" @files-selected=${state.onFiles}></pw-file-dropzone>
    </div>
  </pw-panel>`;
}
