import { LitElement, css, html } from 'lit';

export class ProgressBar extends LitElement {
  static override properties = {
    value: { type: Number },
    max: { type: Number },
    label: { type: String },
  };

  static override styles = css`
    :host { display: block; }
    .row { display: flex; justify-content: space-between; gap: .75rem; margin-bottom: .35rem; color: var(--pw-color-ink-muted, #59636e); font-size: var(--pw-font-size-sm, .75rem); }
    progress { display: block; width: 100%; height: .45rem; accent-color: var(--pw-color-accent, #1859c9); }
  `;

  value = 0;
  max = 100;
  label = 'Progreso';

  override render() {
    const safeMax = this.max > 0 ? this.max : 1;
    const percent = Math.round((Math.min(Math.max(this.value, 0), safeMax) / safeMax) * 100);
    return html`<div class="row"><span>${this.label}</span><span>${percent}%</span></div><progress .value=${Math.min(this.value, safeMax)} .max=${safeMax} aria-label=${this.label}></progress>`;
  }
}

customElements.define('pw-progress', ProgressBar);
