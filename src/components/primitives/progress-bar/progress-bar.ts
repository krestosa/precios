import { LitElement } from 'lit';
import { progressBarStyles } from './progress-bar.styles';
import { progressBarTemplate } from './progress-bar.template';

export class ProgressBar extends LitElement {
  static override properties = {
    value: { type: Number },
    max: { type: Number },
    label: { type: String },
  };

  static override styles = progressBarStyles;

  value = 0;
  max = 100;
  label = 'Progreso';

  override render() {
    const safeMax = this.max > 0 ? this.max : 1;
    const value = Math.min(Math.max(this.value, 0), safeMax);
    return progressBarTemplate({ value, max: safeMax, label: this.label, percent: Math.round((value / safeMax) * 100) });
  }
}

customElements.define('pw-progress', ProgressBar);
