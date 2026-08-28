import { LitElement, css, html } from 'lit';

export interface TabOption {
  readonly id: string;
  readonly label: string;
}

export interface TabChangeDetail { readonly id: string; }

export class SegmentedTabs extends LitElement {
  static override properties = {
    items: { attribute: false },
    selected: { type: String },
    label: { type: String },
  };

  static override styles = css`
    :host { display: inline-flex; max-width: 100%; }
    [role='tablist'] { display: inline-flex; max-width: 100%; padding: 0.2rem; border: 1px solid var(--pw-color-border, #d4dae0); border-radius: var(--pw-radius-md, 0.625rem); background: var(--pw-color-surface-muted, #eef1f4); }
    button { border: 0; border-radius: calc(var(--pw-radius-md, 0.625rem) - 0.15rem); padding: 0.42rem 0.72rem; background: transparent; color: var(--pw-color-ink-muted, #59636e); font: 650 var(--pw-font-size-sm, 0.75rem) / 1.2 var(--pw-font-family, sans-serif); cursor: pointer; }
    button[aria-selected='true'] { color: var(--pw-color-ink, #17202a); background: var(--pw-color-surface, #fff); box-shadow: 0 1px 2px rgb(17 24 39 / .08); }
    button:focus-visible { outline: 3px solid color-mix(in srgb, var(--pw-color-accent, #1859c9) 30%, transparent); outline-offset: 1px; }
  `;

  items: readonly TabOption[] = [];
  selected = '';
  label = 'Vistas';

  private select(id: string) {
    this.dispatchEvent(new CustomEvent<TabChangeDetail>('tab-change', { detail: { id }, bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent, index: number) {
    if (this.items.length === 0) return;
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % this.items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + this.items.length) % this.items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = this.items.length - 1;
    else return;

    const nextItem = this.items[nextIndex];
    if (!nextItem) return;
    event.preventDefault();
    this.select(nextItem.id);
    queueMicrotask(() => this.renderRoot.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus());
  }

  override render() {
    return html`<div role="tablist" aria-label=${this.label}>
      ${this.items.map((item, index) => html`<button type="button" role="tab" aria-selected=${String(item.id === this.selected)} tabindex=${item.id === this.selected ? '0' : '-1'} @keydown=${(event: KeyboardEvent) => this.onKeyDown(event, index)} @click=${() => this.select(item.id)}>${item.label}</button>`)}
    </div>`;
  }
}

customElements.define('pw-segmented-tabs', SegmentedTabs);
