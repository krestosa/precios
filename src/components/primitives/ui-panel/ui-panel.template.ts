import { html, nothing, type TemplateResult } from 'lit';

export function uiPanelTemplate(heading: string, description: string): TemplateResult {
  return html`<section>
    <header>
      <div><h2>${heading}</h2>${description ? html`<p>${description}</p>` : nothing}</div>
      <slot name="actions"></slot>
    </header>
    <div class="body"><slot></slot></div>
    <slot name="footer"></slot>
  </section>`;
}
