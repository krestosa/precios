import { LitElement } from 'lit';
import { uiPanelStyles } from './ui-panel.styles';
import { uiPanelTemplate } from './ui-panel.template';

export class UiPanel extends LitElement {
  static override properties = {
    heading: { type: String },
    description: { type: String },
  };

  static override styles = uiPanelStyles;

  heading = '';
  description = '';

  override render() {
    return uiPanelTemplate(this.heading, this.description);
  }
}

customElements.define('pw-panel', UiPanel);
