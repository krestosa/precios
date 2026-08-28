import { LitElement } from 'lit';
import { emptyStateStyles } from './empty-state.styles';
import { emptyStateTemplate } from './empty-state.template';

export class EmptyState extends LitElement {
  static override properties = {
    heading: { type: String },
    message: { type: String },
  };

  static override styles = emptyStateStyles;

  heading = 'Sin contenido';
  message = '';

  override render() {
    return emptyStateTemplate(this.heading, this.message);
  }
}

customElements.define('pw-empty-state', EmptyState);
