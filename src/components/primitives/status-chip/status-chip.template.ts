import { html, type TemplateResult } from 'lit';
import type { StatusTone } from './status-chip';

export function statusChipTemplate(tone: StatusTone, label: string): TemplateResult {
  const mark = tone === 'danger' ? '×' : tone === 'warning' ? '!' : tone === 'success' ? '✓' : '•';
  return html`<span role="status"><span class="mark" aria-hidden="true">${mark}</span>${label}<slot></slot></span>`;
}
