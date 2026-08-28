import markup from './workbench-layout.html?raw';
import styles from './workbench-layout.css?raw';
import { mountStaticShadow } from '../../components/shadow';

export class WorkbenchLayout extends HTMLElement {
  constructor() {
    super();
    mountStaticShadow(this, markup, styles);
  }
}

if (!customElements.get('pw-workbench-layout')) customElements.define('pw-workbench-layout', WorkbenchLayout);
