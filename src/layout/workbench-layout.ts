import { LitElement, css, html } from 'lit';

export class WorkbenchLayout extends LitElement {
  static override styles = css`
    :host { display: block; min-width: 0; }
    .shell { display: grid; gap: var(--pw-space-4, 1rem); grid-template-columns: minmax(17rem, 0.8fr) minmax(25rem, 1.6fr) minmax(18rem, 0.9fr); align-items: start; }
    .column { min-width: 0; display: grid; gap: var(--pw-space-4, 1rem); }
    @media (max-width: 74rem) { .shell { grid-template-columns: minmax(16rem, .8fr) minmax(24rem, 1.4fr); } .right { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 52rem) { .shell { grid-template-columns: 1fr; } .right { grid-column: auto; grid-template-columns: 1fr; } }
  `;

  override render() {
    return html`<div class="shell">
      <div class="column left"><slot name="left"></slot></div>
      <main class="column center"><slot name="center"></slot></main>
      <aside class="column right"><slot name="right"></slot></aside>
    </div>`;
  }
}

customElements.define('pw-workbench-layout', WorkbenchLayout);
