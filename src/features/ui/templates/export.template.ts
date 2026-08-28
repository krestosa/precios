import { html, type TemplateResult } from 'lit';
import type { ManifestUiFormat } from '../events';
import type { WorkbenchFileView } from '../models';

export interface ExportTemplateState {
  readonly files: readonly WorkbenchFileView[];
  readonly onExport: (kind: 'batch' | 'file' | 'zip', fileIds: readonly string[]) => void;
  readonly onManifest: (format: ManifestUiFormat, fileIds: readonly string[]) => void;
}

export function exportTemplate(state: ExportTemplateState): TemplateResult {
  const exportable = state.files.filter((file) => file.exportable);
  const errored = state.files.filter((file) => file.preflight?.blocking || file.generation?.status === 'error' || (file.errors?.length ?? 0) > 0);
  const ids = exportable.map((file) => file.id);
  return html`<pw-panel heading="Export" description="Archivos individuales, lote, ZIP y manifest de trazabilidad.">
    <div class="stack">
      <p class="export-note"><strong>${exportable.length} exportable(s)</strong> · ${errored.length} con error. Los archivos con error no impiden exportar los válidos.</p>
      <pw-button variant="primary" ?disabled=${exportable.length === 0} @click=${() => state.onExport('batch', ids)}>Exportar lote · ${exportable.length} válidos · ${errored.length} con error</pw-button>
      <pw-button ?disabled=${exportable.length === 0} @click=${() => state.onExport('zip', ids)}>Generar ZIP</pw-button>
      <div class="row"><pw-button ?disabled=${exportable.length === 0} @click=${() => state.onManifest('json', ids)}>Manifest JSON</pw-button><pw-button ?disabled=${exportable.length === 0} @click=${() => state.onManifest('csv', ids)}>Manifest CSV</pw-button></div>
      ${exportable.length === 0 ? html`<pw-empty-state heading="Sin archivos exportables" message="Los controles se habilitarán cuando el adaptador marque archivos como exportables."></pw-empty-state>` : html`<ul class="export-list" aria-label="Archivos individuales exportables">${exportable.map((file) => html`<li class="export-item"><div class="export-text"><strong>${file.fileName}</strong><span class="small muted">Listo para exportación individual</span></div><pw-button @click=${() => state.onExport('file', [file.id])}>Exportar</pw-button></li>`)}</ul>`}
    </div>
  </pw-panel>`;
}
