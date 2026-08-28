import markup from './details-drawer.html?raw';
import styles from './details-drawer.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export class DetailsDrawer extends HTMLElement {
  static get observedAttributes(): string[] { return ['open', 'heading']; }

  private readonly aside: HTMLElement;
  private readonly headingNode: HTMLElement;
  private readonly backdrop: HTMLElement;
  private readonly closeButton: HTMLButtonElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.aside = requiredElement(root, 'aside');
    this.headingNode = requiredElement(root, 'h2');
    this.backdrop = requiredElement(root, '.backdrop');
    this.closeButton = requiredElement(root, '.close');
    this.backdrop.addEventListener('click', () => this.close());
    this.closeButton.addEventListener('click', () => this.close());
    this.aside.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.close();
    });
  }

  get open(): boolean { return this.hasAttribute('open'); }
  set open(value: boolean) { this.toggleAttribute('open', value); }
  get heading(): string { return this.getAttribute('heading') ?? 'Detalles'; }
  set heading(value: string) { this.setAttribute('heading', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(name: string): void { this.sync(); if (name === 'open' && this.open) queueMicrotask(() => this.aside.focus()); }

  private sync(): void {
    this.headingNode.textContent = this.heading;
    this.aside.setAttribute('aria-label', this.heading);
    this.aside.setAttribute('aria-hidden', String(!this.open));
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('drawer-close', { bubbles: true, composed: true }));
  }
}

if (!customElements.get('pw-details-drawer')) customElements.define('pw-details-drawer', DetailsDrawer);
