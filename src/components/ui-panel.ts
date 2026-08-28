import { LitElement, css, html } from 'lit';

export class UiPanel extends LitElement {
  static override properties = {
    heading: { type: String },
    description: { type: String },
  };

  static override styles = css`
    :host { display: block; min-width: 0; }
    section { border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-lg, 0.875rem); background: var(--pw-color-surface, #fff); box-shadow: var(--pw-shadow-raised, 0 1px 2px rgb(0 0 0 / .08)); overflow: clip; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: var(--pw-space-4, 1rem); border-bottom: 1px solid var(--pw-color-border, #d4dae0); }
    h2 { margin: 0; font-size: var(--pw-font-size-lg, 1rem); line-height: 1.25; }
    p { margin: 0.3rem 0 0; color: var(--pw-color-ink-muted, #59636e); font-size: var(--pw-font-size-sm, 0.75rem); }
    .body { padding: var(--pw-space-4, 1rem); }
  `;

  heading = '';
  description = '';

  override render() {
    return html`<section>
      <header>
        <div><h2>${this.heading}</h2>${this.description ? html`<p>${this.description}</p>` : null}</div>
        <slot name="actions"></slot>
      </header>
      <div class="body"><slot></slot></div>
    </section>`;
  }
}

customElements.define('pw-panel', UiPanel);
