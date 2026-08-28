import { LitElement, css, html } from 'lit';

export class DetailsDrawer extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    heading: { type: String },
  };

  static override styles = css`
    :host { display: contents; }
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(17 24 39 / .18); opacity: 0; pointer-events: none; transition: opacity var(--pw-motion-normal, 180ms) ease; }
    aside { position: fixed; inset: 0 0 0 auto; z-index: 41; width: min(30rem, 92vw); padding: var(--pw-space-5, 1.25rem); background: var(--pw-color-surface, #fff); box-shadow: var(--pw-shadow-overlay, 0 16px 48px rgb(0 0 0 / .18)); transform: translateX(102%); transition: transform var(--pw-motion-normal, 180ms) var(--pw-motion-ease, ease); overflow: auto; }
    :host([open]) .backdrop { opacity: 1; pointer-events: auto; }
    :host([open]) aside { transform: translateX(0); }
    header { display: flex; justify-content: space-between; gap: 1rem; align-items: center; margin-bottom: 1rem; }
    h2 { margin: 0; font-size: var(--pw-font-size-xl, 1.25rem); }
    button { border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-sm, .375rem); background: var(--pw-color-surface, #fff); padding: .4rem .6rem; cursor: pointer; }
    button:focus-visible { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 30%, transparent); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { .backdrop, aside { transition: none; } }
  `;

  open = false;
  heading = 'Detalles';

  private close() {
    this.dispatchEvent(new CustomEvent('drawer-close', { bubbles: true, composed: true }));
  }

  override render() {
    return html`<div class="backdrop" @click=${this.close} aria-hidden="true"></div>
      <aside role="dialog" aria-modal="false" aria-label=${this.heading} aria-hidden=${String(!this.open)}>
        <header><h2>${this.heading}</h2><button type="button" @click=${this.close} aria-label="Cerrar detalles">Cerrar</button></header>
        <slot></slot>
      </aside>`;
  }
}

customElements.define('pw-details-drawer', DetailsDrawer);
