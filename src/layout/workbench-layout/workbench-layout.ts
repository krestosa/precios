import { LitElement } from 'lit';
import { workbenchLayoutStyles } from './workbench-layout.styles';
import { workbenchLayoutTemplate } from './workbench-layout.template';

export class WorkbenchLayout extends LitElement {
  static override styles = workbenchLayoutStyles;

  override render() {
    return workbenchLayoutTemplate();
  }
}

customElements.define('pw-workbench-layout', WorkbenchLayout);
