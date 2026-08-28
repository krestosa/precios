import { LitElement } from 'lit';
import { segmentedTabsStyles } from './segmented-tabs.styles';
import { segmentedTabsTemplate } from './segmented-tabs.template';

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

  static override styles = segmentedTabsStyles;

  items: readonly TabOption[] = [];
  selected = '';
  label = 'Vistas';

  private select(id: string): void {
    this.dispatchEvent(new CustomEvent<TabChangeDetail>('tab-change', { detail: { id }, bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent, index: number): void {
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
    return segmentedTabsTemplate({
      items: this.items,
      selected: this.selected,
      label: this.label,
      onSelect: (id) => this.select(id),
      onKeyDown: (event, index) => this.onKeyDown(event, index),
    });
  }
}

customElements.define('pw-segmented-tabs', SegmentedTabs);
