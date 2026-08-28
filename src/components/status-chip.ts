import { LitElement, css, html } from 'lit';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export class StatusChip extends LitElement {
  static override properties = {
    tone: { type: String, reflect: true },
    label: { type: String },
  };

  static override styles = css`
    :host { display: inline-flex; }
    span { display: inline-flex; align-items: center; gap: 0.35rem; border-radius: var(--pw-radius-pill, 999px); padding: 0.22rem 0.48rem; font: 600 var(--pw-font-size-sm, 0.75rem) / 1.2 var(--pw-font-family, sans-serif); background: var(--pw-color-surface-muted, #eef1f4); color: var(--pw-color-ink-muted, #59636e); white-space: nowrap; }
    :host([tone='info']) span { color: var(--pw-color-info, #175cd3); background: #edf4ff; }
    :host([tone='success']) span { color: var(--pw-color-success, #166534); background: #edf8f1; }
    :host([tone='warning']) span { color: var(--pw-color-warning, #8a4b08); background: #fff6e8; }
    :host([tone='danger']) span { color: var(--pw-color-danger, #b42318); background: #fff0ef; }
    .mark { font-size: 0.65rem; }
  `;

  tone: StatusTone = 'neutral';
  label = '';

  override render() {
    const mark = this.tone === 'danger' ? '×' : this.tone === 'warning' ? '!' : this.tone === 'success' ? '✓' : '•';
    return html`<span role="status"><span class="mark" aria-hidden="true">${mark}</span>${this.label}<slot></slot></span>`;
  }
}

customElements.define('pw-status-chip', StatusChip);
