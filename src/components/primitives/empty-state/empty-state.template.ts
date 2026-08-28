import { html, nothing, type TemplateResult } from 'lit';

export function emptyStateTemplate(heading: string, message: string): TemplateResult {
  return html`<div class="empty"><strong>${heading}</strong>${message ? html`<p>${message}</p>` : nothing}<slot></slot></div>`;
}
