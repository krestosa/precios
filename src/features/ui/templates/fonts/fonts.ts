import markup from './fonts.html?raw';
import styles from './fonts.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement } from '../../../../components/shadow';
import type { FileDropzone, FilesSelectedDetail, StatusChip } from '../../../../components';
import type { FontView, UiLoadStatus } from '../../models';
import { fontLabel, fontTone } from '../../presentation';
import { emitUiTemplateEvent } from '../template-events';

export class FontsTemplate extends HTMLElement {
  private readonly list: HTMLUListElement;
  private readonly empty: HTMLElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private readonly dropzone: FileDropzone;
  private fontsValue: readonly FontView[] = [];
  private loadStatusValue: UiLoadStatus = 'empty';

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.list = requiredElement(root, '.font-list');
    this.empty = requiredElement(root, '.empty');
    this.itemTemplate = requiredElement(root, '.font-template');
    this.dropzone = requiredElement(root, '.font-dropzone');
    this.dropzone.addEventListener('files-selected', (event) => { event.stopPropagation(); emitUiTemplateEvent(this, 'ui:font-files', (event as CustomEvent<FilesSelectedDetail>).detail); });
  }

  set fonts(value: readonly FontView[]) { this.fontsValue = value; this.sync(); }
  get fonts(): readonly FontView[] { return this.fontsValue; }
  set loadStatus(value: UiLoadStatus) { this.loadStatusValue = value; this.sync(); }
  get loadStatus(): UiLoadStatus { return this.loadStatusValue; }
  connectedCallback(): void { this.sync(); }

  private sync(): void {
    this.dropzone.status = this.loadStatusValue;
    this.empty.hidden = this.fontsValue.length > 0;
    this.list.hidden = this.fontsValue.length === 0;
    this.list.replaceChildren();
    this.fontsValue.forEach((font) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'strong').textContent = font.record.spec.family;
      requiredElement<HTMLElement>(fragment, '.font-text span').textContent = `Peso ${font.record.spec.weight} · ${font.record.spec.style}${font.requiredBy?.length ? ` · ${font.requiredBy.length} archivo(s)` : ''}`;
      const chip = requiredElement<StatusChip>(fragment, 'pw-status-chip');
      chip.tone = fontTone(font.uiStatus);
      chip.label = fontLabel(font.uiStatus);
      this.list.append(fragment);
    });
  }
}

if (!customElements.get('pw-fonts-template')) customElements.define('pw-fonts-template', FontsTemplate);
