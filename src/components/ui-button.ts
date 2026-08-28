import { LitElement, css, html } from 'lit';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export class UiButton extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean, reflect: true },
  };

  static override styles = css`
    :host { display: inline-flex; }
    button {
      min-height: 2.25rem;
      border: 1px solid var(--pw-color-border, #d4dae0);
      border-radius: var(--pw-radius-md, 0.625rem);
      padding: 0.5rem 0.8rem;
      font: 600 var(--pw-font-size-md, 0.875rem) / 1.2 var(--pw-font-family, sans-serif);
      color: var(--pw-color-ink, #17202a);
      background: var(--pw-color-surface, #fff);
      cursor: pointer;
      transition: background var(--pw-motion-fast, 120ms) var(--pw-motion-ease, ease), transform var(--pw-motion-fast, 120ms) var(--pw-motion-ease, ease);
    }
    button:hover:not(:disabled) { background: var(--pw-color-surface-muted, #eef1f4); }
    button:active:not(:disabled) { transform: translateY(1px); }
    button:focus-visible { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 35%, transparent); outline-offset: 2px; }
    :host([variant='primary']) button { color: #fff; border-color: var(--pw-color-accent, #1859c9); background: var(--pw-color-accent, #1859c9); }
    :host([variant='primary']) button:hover:not(:disabled) { background: var(--pw-color-accent-strong, #0f429b); }
    :host([variant='ghost']) button { border-color: transparent; background: transparent; }
    :host([variant='danger']) button { color: #fff; border-color: var(--pw-color-danger, #b42318); background: var(--pw-color-danger, #b42318); }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    .busy { margin-right: 0.45rem; }
    @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  `;

  variant: UiButtonVariant = 'secondary';
  disabled = false;
  busy = false;

  override render() {
    return html`<button type="button" ?disabled=${this.disabled || this.busy} aria-busy=${this.busy ? 'true' : 'false'}>
      ${this.busy ? html`<span class="busy" aria-hidden="true">…</span>` : null}<slot></slot>
    </button>`;
  }
}

customElements.define('pw-button', UiButton);
