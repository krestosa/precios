import { LitElement, type PropertyValues } from 'lit';
import { detailsDrawerStyles } from './details-drawer.styles';
import { detailsDrawerTemplate } from './details-drawer.template';

export class DetailsDrawer extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    heading: { type: String },
  };

  static override styles = detailsDrawerStyles;

  open = false;
  heading = 'Detalles';

  private close(): void {
    this.dispatchEvent(new CustomEvent('drawer-close', { bubbles: true, composed: true }));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.close();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open') || !this.open) return;
    queueMicrotask(() => this.renderRoot.querySelector<HTMLElement>('aside')?.focus());
  }

  override render() {
    return detailsDrawerTemplate({ open: this.open, heading: this.heading, onClose: () => this.close(), onKeyDown: (event) => this.onKeyDown(event) });
  }
}

customElements.define('pw-details-drawer', DetailsDrawer);
