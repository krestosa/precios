import markup from './empty-state.html?raw';
import styles from './empty-state.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export class EmptyState extends HTMLElement {
  static get observedAttributes(): string[] { return ['heading', 'message']; }

  private readonly headingNode: HTMLElement;
  private readonly messageNode: HTMLParagraphElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.headingNode = requiredElement(root, 'strong');
    this.messageNode = requiredElement(root, 'p');
  }

  get heading(): string { return this.getAttribute('heading') ?? 'Sin contenido'; }
  set heading(value: string) { this.setAttribute('heading', value); }
  get message(): string { return this.getAttribute('message') ?? ''; }
  set message(value: string) { this.setAttribute('message', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.headingNode.textContent = this.heading;
    this.messageNode.textContent = this.message;
    this.messageNode.hidden = this.message.length === 0;
  }
}

if (!customElements.get('pw-empty-state')) customElements.define('pw-empty-state', EmptyState);
