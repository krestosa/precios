import { LitElement, css, html } from 'lit';

export interface DataListItem {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly meta?: string;
  readonly selected?: boolean;
}

export class DataList extends LitElement {
  static override properties = {
    items: { attribute: false },
    label: { type: String },
  };

  static override styles = css`
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem .75rem; text-align: left; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, .625rem); padding: .65rem .75rem; background: var(--pw-color-surface, #fff); color: var(--pw-color-ink, #17202a); cursor: pointer; }
    button[aria-current='true'] { border-color: var(--pw-color-accent, #1859c9); box-shadow: inset 3px 0 0 var(--pw-color-accent, #1859c9); }
    button:focus-visible { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 30%, transparent); outline-offset: 2px; }
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    small { color: var(--pw-color-ink-muted, #59636e); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-size: var(--pw-font-size-sm, .75rem); color: var(--pw-color-ink-muted, #59636e); }
  `;

  items: readonly DataListItem[] = [];
  label = 'Lista';

  private activate(id: string) { this.dispatchEvent(new CustomEvent('item-activate', { detail: { id }, bubbles: true, composed: true })); }

  override render() {
    return html`<ul aria-label=${this.label}>${this.items.map((item) => html`<li><button type="button" aria-current=${item.selected ? 'true' : 'false'} @click=${() => this.activate(item.id)}><strong>${item.primary}</strong>${item.secondary ? html`<small>${item.secondary}</small>` : html`<span></span>`}${item.meta ? html`<span class="meta">${item.meta}</span>` : null}</button></li>`)}</ul>`;
  }
}

customElements.define('pw-data-list', DataList);
