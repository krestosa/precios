import { LitElement } from 'lit';
import { statusChipStyles } from './status-chip.styles';
import { statusChipTemplate } from './status-chip.template';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export class StatusChip extends LitElement {
  static override properties = {
    tone: { type: String, reflect: true },
    label: { type: String },
  };

  static override styles = statusChipStyles;

  tone: StatusTone = 'neutral';
  label = '';

  override render() {
    return statusChipTemplate(this.tone, this.label);
  }
}

customElements.define('pw-status-chip', StatusChip);
