import markup from './results-gallery.html?raw';
import styles from './results-gallery.css?raw';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { WorkbenchFileView } from '../../models';
import { emitUiTemplateEvent } from '../template-events';
import {
  FIT_LIGHTBOX_TRANSFORM,
  LIGHTBOX_MAX_ZOOM,
  LIGHTBOX_MIN_ZOOM,
  deriveGalleryItems,
  panFromDrag,
  svgToDataUrl,
  zoomAround,
  zoomFromWheel,
  type GalleryItemView,
  type LightboxTransform,
} from './results-gallery-state';

interface DragState {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly transform: LightboxTransform;
}

export class ResultsGalleryTemplate extends HTMLElement {
  private readonly empty: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly count: HTMLElement;
  private readonly itemTemplate: HTMLTemplateElement;
  private readonly lightbox: HTMLElement;
  private readonly lightboxTitle: HTMLElement;
  private readonly lightboxTarget: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly lightboxImage: HTMLImageElement;
  private readonly zoomLevel: HTMLElement;
  private readonly zoomOutButton: HTMLButtonElement;
  private readonly zoomInButton: HTMLButtonElement;
  private readonly fitButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private filesValue: readonly WorkbenchFileView[] = [];
  private selectedFileIdValue: string | undefined;
  private activeItem: GalleryItemView | undefined;
  private transform: LightboxTransform = FIT_LIGHTBOX_TRANSFORM;
  private drag: DragState | undefined;
  private returnFocus: HTMLElement | null = null;
  private previousBodyOverflow = '';
  private previousRootOverflow = '';
  private suppressBackdropClick = false;
  private keyListenerInstalled = false;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.empty = requiredElement(root, '.empty');
    this.grid = requiredElement(root, '.grid');
    this.count = requiredElement(root, '.count');
    this.itemTemplate = requiredElement(root, '.item-template');
    this.lightbox = requiredElement(root, '.lightbox');
    this.lightboxTitle = requiredElement(root, '.lightbox-title');
    this.lightboxTarget = requiredElement(root, '.lightbox-target');
    this.viewport = requiredElement(root, '.lightbox-viewport');
    this.lightboxImage = requiredElement(root, '.lightbox-image');
    this.zoomLevel = requiredElement(root, '.zoom-level');
    this.zoomOutButton = requiredElement(root, '.zoom-out');
    this.zoomInButton = requiredElement(root, '.zoom-in');
    this.fitButton = requiredElement(root, '.fit-button');
    this.closeButton = requiredElement(root, '.close');

    this.closeButton.addEventListener('click', () => this.closeLightbox());
    this.fitButton.addEventListener('click', () => this.resetTransform());
    this.zoomInButton.addEventListener('click', () => this.stepZoom(1.25));
    this.zoomOutButton.addEventListener('click', () => this.stepZoom(0.8));
    this.lightbox.addEventListener('click', (event) => this.onBackdropClick(event));
    this.viewport.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.viewport.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.viewport.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.viewport.addEventListener('pointerup', (event) => this.onPointerEnd(event));
    this.viewport.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
  }

  set files(value: readonly WorkbenchFileView[]) { this.filesValue = value; this.sync(); }
  get files(): readonly WorkbenchFileView[] { return this.filesValue; }
  set selectedFileId(value: string | undefined) { this.selectedFileIdValue = value; this.sync(); }
  get selectedFileId(): string | undefined { return this.selectedFileIdValue; }

  connectedCallback(): void {
    upgradeProperty(this, 'files');
    upgradeProperty(this, 'selectedFileId');
    this.sync();
  }

  disconnectedCallback(): void {
    this.closeLightbox(false);
  }

  private sync(): void {
    const items = deriveGalleryItems(this.filesValue);
    this.empty.hidden = items.length > 0;
    this.grid.hidden = items.length === 0;
    this.count.textContent = `${items.length} output${items.length === 1 ? '' : 's'}`;
    this.grid.replaceChildren();

    items.forEach((item) => {
      const fragment = this.itemTemplate.content.cloneNode(true) as DocumentFragment;
      const card = requiredElement<HTMLElement>(fragment, '.gallery-card');
      const previewButton = requiredElement<HTMLButtonElement>(fragment, '.preview-button');
      const thumbnail = requiredElement<HTMLImageElement>(fragment, '.thumbnail');
      const placeholder = requiredElement<HTMLElement>(fragment, '.placeholder');
      const placeholderText = requiredElement<HTMLElement>(fragment, '.placeholder-text');
      const status = requiredElement<HTMLElement>(fragment, '.state-badge');
      const fileName = requiredElement<HTMLElement>(fragment, '.file-name');
      const target = requiredElement<HTMLElement>(fragment, '.target');
      const selectButton = requiredElement<HTMLButtonElement>(fragment, '.select-button');
      const exportButton = requiredElement<HTMLButtonElement>(fragment, '.export-button');
      const selected = item.id === this.selectedFileIdValue;

      card.dataset.state = item.statusKind;
      card.classList.toggle('selected', selected);
      fileName.textContent = item.fileName;
      target.textContent = item.targetLabel;
      target.title = item.targetLabel;
      status.textContent = item.statusLabel;
      fileName.title = item.fileName;
      selectButton.textContent = selected ? 'Seleccionado' : 'Mostrar';
      selectButton.setAttribute('aria-pressed', String(selected));
      selectButton.setAttribute('aria-label', `${selected ? 'Output seleccionado' : 'Mostrar en canvas'}: ${item.fileName}`);
      selectButton.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:file-activate', { id: item.id }));

      if (item.svg) {
        thumbnail.src = svgToDataUrl(item.svg);
        thumbnail.alt = `Resultado procesado de ${item.fileName}`;
        previewButton.setAttribute('aria-label', `Abrir resultado procesado de ${item.fileName}`);
        previewButton.addEventListener('click', () => {
          emitUiTemplateEvent(this, 'ui:file-activate', { id: item.id });
          this.openLightbox(item, previewButton);
        });
        placeholder.hidden = true;
      } else {
        previewButton.hidden = true;
        thumbnail.removeAttribute('src');
        placeholder.hidden = false;
        placeholderText.textContent = item.statusLabel;
      }

      exportButton.hidden = !item.exportable;
      exportButton.setAttribute('aria-label', `Exportar ${item.fileName}`);
      if (item.exportable) {
        exportButton.addEventListener('click', () => emitUiTemplateEvent(this, 'ui:export-request', { kind: 'file', fileIds: [item.id] }));
      }
      this.grid.append(fragment);
    });

    if (this.activeItem) {
      const refreshed = items.find((item) => item.id === this.activeItem?.id);
      if (!refreshed?.svg) this.closeLightbox();
      else {
        this.activeItem = refreshed;
        this.lightboxImage.src = svgToDataUrl(refreshed.svg);
        this.lightboxTitle.textContent = refreshed.fileName;
        this.lightboxTarget.textContent = refreshed.targetLabel;
      }
    }
  }

  private openLightbox(item: GalleryItemView, trigger: HTMLElement): void {
    if (!item.svg) return;
    this.activeItem = item;
    this.returnFocus = trigger;
    this.lightboxTitle.textContent = item.fileName;
    this.lightboxTarget.textContent = item.targetLabel;
    this.lightboxImage.src = svgToDataUrl(item.svg);
    this.lightboxImage.alt = `Resultado ampliado de ${item.fileName}`;
    this.lightbox.hidden = false;
    this.resetTransform();
    this.lockScroll();
    this.installKeyListener();
    queueMicrotask(() => this.closeButton.focus());
  }

  private closeLightbox(restoreFocus = true): void {
    if (this.lightbox.hidden && !this.keyListenerInstalled) return;
    this.lightbox.hidden = true;
    this.lightboxImage.removeAttribute('src');
    this.activeItem = undefined;
    this.drag = undefined;
    this.suppressBackdropClick = false;
    this.resetTransform();
    this.unlockScroll();
    this.removeKeyListener();
    if (restoreFocus && this.returnFocus?.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }

  private viewportSize(): { readonly width: number; readonly height: number } {
    const rect = this.viewport.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  private onWheel(event: WheelEvent): void {
    if (this.lightbox.hidden) return;
    event.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const anchorX = event.clientX - rect.left - width / 2;
    const anchorY = event.clientY - rect.top - height / 2;
    this.transform = zoomFromWheel(this.transform, event.deltaY, anchorX, anchorY, width, height);
    this.applyTransform();
  }

  private stepZoom(factor: number): void {
    const { width, height } = this.viewportSize();
    this.transform = zoomAround(this.transform, this.transform.zoom * factor, 0, 0, width, height);
    this.applyTransform();
  }

  private resetTransform(): void {
    this.transform = FIT_LIGHTBOX_TRANSFORM;
    this.applyTransform();
  }

  private applyTransform(): void {
    const { zoom, panX, panY } = this.transform;
    this.lightboxImage.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    this.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    this.viewport.classList.toggle('can-pan', zoom > LIGHTBOX_MIN_ZOOM);
    this.zoomOutButton.disabled = zoom <= LIGHTBOX_MIN_ZOOM;
    this.zoomInButton.disabled = zoom >= LIGHTBOX_MAX_ZOOM;
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.transform.zoom <= LIGHTBOX_MIN_ZOOM || event.button !== 0) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, transform: this.transform };
    this.suppressBackdropClick = false;
    this.viewport.classList.add('dragging');
    if ('setPointerCapture' in this.viewport) this.viewport.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - this.drag.x;
    const deltaY = event.clientY - this.drag.y;
    const { width, height } = this.viewportSize();
    this.transform = panFromDrag(this.drag.transform, deltaX, deltaY, width, height);
    if (Math.hypot(deltaX, deltaY) > 4) this.suppressBackdropClick = true;
    this.applyTransform();
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if ('hasPointerCapture' in this.viewport && this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    this.drag = undefined;
    this.viewport.classList.remove('dragging');
  }

  private onBackdropClick(event: MouseEvent): void {
    if (event.target !== this.lightbox) return;
    if (this.suppressBackdropClick) {
      this.suppressBackdropClick = false;
      return;
    }
    this.closeLightbox();
  }

  private installKeyListener(): void {
    if (this.keyListenerInstalled) return;
    document.addEventListener('keydown', this.onDocumentKeydown);
    this.keyListenerInstalled = true;
  }

  private removeKeyListener(): void {
    if (!this.keyListenerInstalled) return;
    document.removeEventListener('keydown', this.onDocumentKeydown);
    this.keyListenerInstalled = false;
  }

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (this.lightbox.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeLightbox();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.lightbox.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')].filter((node) => !node.hidden);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.shadowRoot?.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private lockScroll(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    this.previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    document.documentElement.style.overflow = this.previousRootOverflow;
  }
}

if (!customElements.get('pw-results-gallery-template')) customElements.define('pw-results-gallery-template', ResultsGalleryTemplate);
