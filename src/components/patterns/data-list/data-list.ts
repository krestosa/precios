import markup from './data-list.html?raw';
import styles from './data-list.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export interface DataListItem {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly meta?: string;
  readonly selected?: boolean;
}

export class DataList extends HTMLElement {
  private readonly list: HTMLUListElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private itemsValue: readonly DataListItem[] = [];
  private labelValue = 'Lista';

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.list = requiredElement(root, 'ul');
    this.itemTemplate = requiredElement(root, '.item-template');
  }

  get items(): readonly DataListItem[] { return this.itemsValue; }
  set items(value: readonly DataListItem[]) { this.itemsValue = value; this.renderItems(); }
  get label(): string { return this.labelValue; }
  set label(value: string) { this.labelValue = value; this.list.setAttribute('aria-label', value); }

  connectedCallback(): void { this.renderItems(); }

  private renderItems(): void {
    this.list.replaceChildren();
    this.list.setAttribute('aria-label', this.labelValue);
    this.itemsValue.forEach((item) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      const button = requiredElement<HTMLButtonElement>(fragment, 'button');
      requiredElement<HTMLElement>(fragment, 'strong').textContent = item.primary;
      requiredElement<HTMLElement>(fragment, 'small').textContent = item.secondary ?? '';
      requiredElement<HTMLElement>(fragment, '.meta').textContent = item.meta ?? '';
      button.setAttribute('aria-current', String(Boolean(item.selected)));
      button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('item-activate', { detail: { id: item.id }, bubbles: true, composed: true })));
      this.list.append(fragment);
    });
  }
}

if (!customElements.get('pw-data-list')) customElements.define('pw-data-list', DataList);
