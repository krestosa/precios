import markup from './progress-bar.html?raw';
import styles from './progress-bar.css?raw';
import { mountStaticShadow, requiredElement } from '../../shadow';

export class ProgressBar extends HTMLElement {
  static get observedAttributes(): string[] { return ['value', 'max', 'label']; }

  private readonly labelNode: HTMLElement;
  private readonly percentNode: HTMLElement;
  private readonly progress: HTMLProgressElement;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.labelNode = requiredElement(root, '.label');
    this.percentNode = requiredElement(root, '.percent');
    this.progress = requiredElement(root, 'progress');
  }

  get value(): number { return Number(this.getAttribute('value') ?? 0); }
  set value(value: number) { this.setAttribute('value', String(value)); }
  get max(): number { return Number(this.getAttribute('max') ?? 100); }
  set max(value: number) { this.setAttribute('max', String(value)); }
  get label(): string { return this.getAttribute('label') ?? 'Progreso'; }
  set label(value: string) { this.setAttribute('label', value); }

  connectedCallback(): void { this.sync(); }
  attributeChangedCallback(): void { this.sync(); }

  private sync(): void {
    const safeMax = Number.isFinite(this.max) && this.max > 0 ? this.max : 1;
    const safeValue = Number.isFinite(this.value) ? Math.min(Math.max(this.value, 0), safeMax) : 0;
    this.labelNode.textContent = this.label;
    this.percentNode.textContent = `${Math.round((safeValue / safeMax) * 100)}%`;
    this.progress.max = safeMax;
    this.progress.value = safeValue;
    this.progress.setAttribute('aria-label', this.label);
  }
}

if (!customElements.get('pw-progress')) customElements.define('pw-progress', ProgressBar);
