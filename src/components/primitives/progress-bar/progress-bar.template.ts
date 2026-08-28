import { html, type TemplateResult } from 'lit';

export interface ProgressBarTemplateState {
  readonly value: number;
  readonly max: number;
  readonly label: string;
  readonly percent: number;
}

export function progressBarTemplate(state: ProgressBarTemplateState): TemplateResult {
  return html`<div class="row"><span>${state.label}</span><span>${state.percent}%</span></div><progress .value=${state.value} .max=${state.max} aria-label=${state.label}></progress>`;
}
