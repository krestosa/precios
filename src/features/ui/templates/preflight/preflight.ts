import markup from './preflight.html?raw';
import styles from './preflight.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement } from '../../../../components/shadow';
import type { StatusChip } from '../../../../components';
import type { BatchPreflight, PreflightIssue } from '../../../../domain/contracts';
import { emitUiTemplateEvent } from '../template-events';

export class PreflightTemplate extends HTMLElement {
  private readonly empty: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private readonly runButton: HTMLElement;
  private readonly okChip: StatusChip;
  private readonly warningChip: StatusChip;
  private readonly errorChip: StatusChip;
  private preflightValue: BatchPreflight | undefined;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.empty = requiredElement(root, '.empty');
    this.summary = requiredElement(root, '.summary');
    this.list = requiredElement(root, '.preflight-list');
    this.itemTemplate = requiredElement(root, '.item-template');
    this.runButton = requiredElement(root, '.run');
    this.okChip = requiredElement(root, '.ok');
    this.warningChip = requiredElement(root, '.warnings');
    this.errorChip = requiredElement(root, '.errors');
    this.runButton.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:preflight-request', {}));
  }

  set preflight(value: BatchPreflight | undefined) { this.preflightValue = value; this.sync(); }
  get preflight(): BatchPreflight | undefined { return this.preflightValue; }
  connectedCallback(): void { this.sync(); }

  private severityTone(severity: PreflightIssue['severity']): 'success' | 'warning' | 'danger' {
    return severity === 'OK' ? 'success' : severity === 'WARNING' ? 'warning' : 'danger';
  }

  private sync(): void {
    const preflight = this.preflightValue;
    this.empty.hidden = Boolean(preflight);
    this.summary.hidden = !preflight;
    this.list.hidden = !preflight;
    this.runButton.textContent = preflight ? 'Recalcular preflight' : 'Ejecutar preflight';
    this.runButton.removeAttribute('variant');
    if (!preflight) { this.runButton.setAttribute('variant', 'primary'); this.list.replaceChildren(); return; }

    const issues = [...(preflight.issues ?? []), ...preflight.files.flatMap((file) => file.issues)];
    const ok = issues.filter((issue) => issue.severity === 'OK').length;
    const warnings = issues.filter((issue) => issue.severity === 'WARNING').length;
    const errors = issues.filter((issue) => issue.severity === 'ERROR').length;
    this.okChip.tone = 'success'; this.okChip.label = `${ok} OK`;
    this.warningChip.tone = 'warning'; this.warningChip.label = `${warnings} WARNING`;
    this.errorChip.tone = 'danger'; this.errorChip.label = `${errors} ERROR`;
    this.list.replaceChildren();
    preflight.files.forEach((file) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'strong').textContent = file.fileName;
      requiredElement<HTMLElement>(fragment, '.meta').textContent = `${file.issues.length} incidencia(s) · ${file.blocking ? 'bloqueado' : 'no bloqueante'}`;
      const highest: PreflightIssue['severity'] = file.blocking || file.issues.some((issue) => issue.severity === 'ERROR') ? 'ERROR' : file.issues.some((issue) => issue.severity === 'WARNING') ? 'WARNING' : 'OK';
      const chip = requiredElement<StatusChip>(fragment, 'pw-status-chip');
      chip.tone = this.severityTone(highest); chip.label = highest;
      this.list.append(fragment);
    });
  }
}

if (!customElements.get('pw-preflight-template')) customElements.define('pw-preflight-template', PreflightTemplate);
