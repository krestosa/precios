import { html, nothing, type TemplateResult } from 'lit';
import type { DataListItem } from './data-list';

export function dataListTemplate(items: readonly DataListItem[], label: string, onActivate: (id: string) => void): TemplateResult {
  return html`<ul aria-label=${label}>${items.map((item) => html`<li><button type="button" aria-current=${item.selected ? 'true' : 'false'} @click=${() => onActivate(item.id)}><strong>${item.primary}</strong>${item.secondary ? html`<small>${item.secondary}</small>` : html`<span></span>`}${item.meta ? html`<span class="meta">${item.meta}</span>` : nothing}</button></li>`)}</ul>`;
}
