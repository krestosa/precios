import { LitElement, css, html } from 'lit';

export class EmptyState extends LitElement {
  static override properties = {
    heading: { type: String },
    message: { type: String },
  };

  static override styles = css`
    :host { display: block; }
    .empty { padding: var(--pw-space-6, 1.5rem); border: 1px dashed var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); text-align: center; color: var(--pw-color-ink-muted, #59636e); background: var(--pw-color-canvas, #f4f6f8); }
    strong { display: block; color: var(--pw-color-ink, #17202a); margin-bottom: .35rem; }
    p { margin: 0; font-size: var(--pw-font-size-sm, .75rem); }
  `;

  heading = 'Sin contenido';
  message = '';

  override render() { return html`<div class="empty"><strong>${this.heading}</strong>${this.message ? html`<p>${this.message}</p>` : null}<slot></slot></div>`; }
}

customElements.define('pw-empty-state', EmptyState);
