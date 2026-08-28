import markup from './ui-panel.html?raw';
import styles from './ui-panel.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export class UiPanel extends HTMLElement {
  static get observedAttributes(): string[] { return ['heading', 'description']; }

  private readonly headingNode: HTMLElement;
  private readonly descriptionNode: HTMLParagraphElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.headingNode = requiredElement(root, 'h2');
    this.descriptionNode = requiredElement(root, 'p');
  }

  get heading(): string { return this.getAttribute('heading') ?? ''; }
  set heading(value: string) { this.setAttribute('heading', value); }
  get description(): string { return this.getAttribute('description') ?? ''; }
  set description(value: string) { this.setAttribute('description', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.headingNode.textContent = this.heading;
    this.descriptionNode.textContent = this.description;
    this.descriptionNode.hidden = this.description.length === 0;
  }
}

if (!customElements.get('pw-panel')) customElements.define('pw-panel', UiPanel);
