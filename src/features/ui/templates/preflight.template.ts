import { html, type TemplateResult } from 'lit';
import type { PreflightIssue } from '../../../domain/contracts';
import type { WorkbenchViewModel } from '../models';

function severityTone(severity: PreflightIssue['severity']): 'success' | 'warning' | 'danger' {
  return severity === 'OK' ? 'success' : severity === 'WARNING' ? 'warning' : 'danger';
}

export function preflightTemplate(model: WorkbenchViewModel, onRun: () => void): TemplateResult {
  const preflight = model.preflight;
  if (!preflight) {
    return html`<pw-panel heading="Preflight" description="Resumen agregado y estado por archivo."><div class="stack"><pw-empty-state heading="Preflight pendiente" message="Ejecutalo cuando matching, precios y tipografías estén disponibles."></pw-empty-state><pw-button variant="primary" @click=${onRun}>Ejecutar preflight</pw-button></div></pw-panel>`;
  }

  const issues = [...(preflight.issues ?? []), ...preflight.files.flatMap((file) => file.issues)];
  const ok = issues.filter((issue) => issue.severity === 'OK').length;
  const warnings = issues.filter((issue) => issue.severity === 'WARNING').length;
  const errors = issues.filter((issue) => issue.severity === 'ERROR').length;
  return html`<pw-panel heading="Preflight" description="Los errores se aíslan por archivo; los válidos permanecen exportables.">
    <div class="stack">
      <div class="preflight-summary"><pw-status-chip tone="success" label=${`${ok} OK`}></pw-status-chip><pw-status-chip tone="warning" label=${`${warnings} WARNING`}></pw-status-chip><pw-status-chip tone="danger" label=${`${errors} ERROR`}></pw-status-chip></div>
      <ul class="preflight-list" aria-label="Preflight por SVG">${preflight.files.map((file) => {
        const highest = file.blocking || file.issues.some((issue) => issue.severity === 'ERROR') ? 'ERROR' : file.issues.some((issue) => issue.severity === 'WARNING') ? 'WARNING' : 'OK';
        return html`<li class="preflight-item"><div><strong>${file.fileName}</strong><div class="small muted">${file.issues.length} incidencia(s) · ${file.blocking ? 'bloqueado' : 'no bloqueante'}</div></div><pw-status-chip tone=${severityTone(highest)} label=${highest}></pw-status-chip></li>`;
      })}</ul>
      <pw-button @click=${onRun}>Recalcular preflight</pw-button>
    </div>
  </pw-panel>`;
}
