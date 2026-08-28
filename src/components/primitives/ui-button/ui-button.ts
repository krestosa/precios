import markup from './ui-button.html?raw';
import styles from './ui-button.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export class UiButton extends HTMLElement {
  static get observedAttributes(): string[] { return ['variant', 'disabled', 'busy', 'aria-label']; }

  private readonly button: HTMLButtonElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.button = requiredElement<HTMLButtonElement>(root, 'button');
  }

  get variant(): UiButtonVariant { return (this.getAttribute('variant') as UiButtonVariant | null) ?? 'secondary'; }
  set variant(value: UiButtonVariant) { this.setAttribute('variant', value); }
  get disabled(): boolean { return this.hasAttribute('disabled'); }
  set disabled(value: boolean) { this.toggleAttribute('disabled', value); }
  get busy(): boolean { return this.hasAttribute('busy'); }
  set busy(value: boolean) { this.toggleAttribute('busy', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.button.disabled = this.disabled || this.busy;
    this.button.setAttribute('aria-busy', String(this.busy));
    const accessibleName = this.getAttribute('aria-label');
    if (accessibleName) this.button.setAttribute('aria-label', accessibleName);
    else this.button.removeAttribute('aria-label');
  }
}

if (!customElements.get('pw-button')) customElements.define('pw-button', UiButton);
