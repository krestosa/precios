import markup from './segmented-tabs.html?raw';
import styles from './segmented-tabs.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export interface TabOption { readonly id: string; readonly label: string; }
export interface TabChangeDetail { readonly id: string; }

export class SegmentedTabs extends HTMLElement {
  private readonly tabs: HTMLElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private itemsValue: readonly TabOption[] = [];
  private selectedValue = '';
  private labelValue = 'Vistas';

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.tabs = requiredElement(root, '.tabs');
    this.itemTemplate = requiredElement(root, '.tab-template');
  }

  get items(): readonly TabOption[] { return this.itemsValue; }
  set items(value: readonly TabOption[]) { this.itemsValue = value; this.renderItems(); }
  get selected(): string { return this.selectedValue; }
  set selected(value: string) { this.selectedValue = value; this.renderItems(); }
  get label(): string { return this.labelValue; }
  set label(value: string) { this.labelValue = value; this.tabs.setAttribute('aria-label', value); }

  connectedCallback(): void { this.renderItems(); }

  private select(id: string): void {
    this.dispatchEvent(new CustomEvent<TabChangeDetail>('tab-change', { detail: { id }, bubbles: true, composed: true }));
  }

  private moveFocus(event: KeyboardEvent, index: number): void {
    if (this.itemsValue.length === 0) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % this.itemsValue.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + this.itemsValue.length) % this.itemsValue.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.itemsValue.length - 1;
    else return;
    const item = this.itemsValue[next];
    if (!item) return;
    event.preventDefault();
    this.select(item.id);
    queueMicrotask(() => this.tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());
  }

  private renderItems(): void {
    this.tabs.replaceChildren();
    this.tabs.setAttribute('aria-label', this.labelValue);
    this.itemsValue.forEach((item, index) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      const button = requiredElement<HTMLButtonElement>(fragment, 'button');
      requiredElement<HTMLElement>(fragment, 'span').textContent = item.label;
      const selected = item.id === this.selectedValue;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.addEventListener('click', () => this.select(item.id));
      button.addEventListener('keydown', (event) => this.moveFocus(event, index));
      this.tabs.append(fragment);
    });
  }
}

if (!customElements.get('pw-segmented-tabs')) customElements.define('pw-segmented-tabs', SegmentedTabs);
