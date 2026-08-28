import markup from './status-chip.html?raw';
import styles from './status-chip.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export class StatusChip extends HTMLElement {
  static get observedAttributes(): string[] { return ['tone', 'label']; }

  private readonly mark: HTMLElement;
  private readonly labelNode: HTMLElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.mark = requiredElement(root, '.mark');
    this.labelNode = requiredElement(root, '.label');
  }

  get tone(): StatusTone { return (this.getAttribute('tone') as StatusTone | null) ?? 'neutral'; }
  set tone(value: StatusTone) { this.setAttribute('tone', value); }
  get label(): string { return this.getAttribute('label') ?? ''; }
  set label(value: string) { this.setAttribute('label', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    this.labelNode.textContent = this.label;
    this.mark.textContent = this.tone === 'danger' ? '×' : this.tone === 'warning' ? '!' : this.tone === 'success' ? '✓' : '•';
  }
}

if (!customElements.get('pw-status-chip')) customElements.define('pw-status-chip', StatusChip);
