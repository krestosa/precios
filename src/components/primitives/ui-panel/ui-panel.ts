import markup from './ui-panel.html?raw';
import styles from './ui-panel.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export class UiPanel extends HTMLElement {
  static get observedAttributes(): string[] { return ['heading', 'description']; }

  private readonly headingNode: HTMLElement;
  private readonly descriptionNode: HTMLParagraphElement;
  private readonly actions: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly actionsSlot: HTMLSlotElement;
  private readonly footerSlot: HTMLSlotElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.headingNode = requiredElement(root, 'h2');
    this.descriptionNode = requiredElement(root, 'p');
    this.actions = requiredElement(root, '.actions');
    this.footer = requiredElement(root, 'footer');
    this.actionsSlot = requiredElement(root, '.actions-slot');
    this.footerSlot = requiredElement(root, '.footer-slot');
    this.actionsSlot.addEventListener('slotchange', () => this.syncSlots());
    this.footerSlot.addEventListener('slotchange', () => this.syncSlots());
  }

  get heading(): string { return this.getAttribute('heading') ?? ''; }
  set heading(value: string) { this.setAttribute('heading', value); }
  get description(): string { return this.getAttribute('description') ?? ''; }
  set description(value: string) { this.setAttribute('description', value); }

  connectedCallback(): void { this.sync(); this.syncSlots(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.headingNode.textContent = this.heading;
    this.descriptionNode.textContent = this.description;
    this.descriptionNode.hidden = this.description.length === 0;
  }

  private syncSlots(): void {
    this.actions.hidden = this.actionsSlot.assignedNodes({ flatten: true }).length === 0;
    this.footer.hidden = this.footerSlot.assignedNodes({ flatten: true }).length === 0;
  }
}

if (!customElements.get('pw-panel')) customElements.define('pw-panel', UiPanel);
