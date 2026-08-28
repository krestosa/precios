import { html, type TemplateResult } from 'lit';

export function workbenchLayoutTemplate(): TemplateResult {
  return html`<div class="shell">
    <div class="column left"><slot name="left"></slot></div>
    <main class="column center"><slot name="center"></slot></main>
    <aside class="column right"><slot name="right"></slot></aside>
  </div>`;
}
