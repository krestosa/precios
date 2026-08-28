import { LitElement } from 'lit';
import { uiButtonStyles } from './ui-button.styles';
import { uiButtonTemplate } from './ui-button.template';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export class UiButton extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean, reflect: true },
    ariaLabel: { type: String, attribute: 'aria-label' },
  };

  static override styles = uiButtonStyles;

  variant: UiButtonVariant = 'secondary';
  disabled = false;
  busy = false;
  ariaLabel = '';

  override render() {
    return uiButtonTemplate({ disabled: this.disabled, busy: this.busy, ariaLabel: this.ariaLabel });
  }
}

customElements.define('pw-button', UiButton);
