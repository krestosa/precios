import { LitElement } from 'lit';
import { dataListStyles } from './data-list.styles';
import { dataListTemplate } from './data-list.template';

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

  static override styles = dataListStyles;

  items: readonly DataListItem[] = [];
  label = 'Lista';

  private activate(id: string): void {
    this.dispatchEvent(new CustomEvent('item-activate', { detail: { id }, bubbles: true, composed: true }));
  }

  override render() {
    return dataListTemplate(this.items, this.label, (id) => this.activate(id));
  }
}

customElements.define('pw-data-list', DataList);
