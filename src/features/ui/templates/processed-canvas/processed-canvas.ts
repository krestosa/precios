import markup from './processed-canvas.html?raw';
import styles from './processed-canvas.css?raw';
import { mountStaticShadow, requiredElement, upgradeProperty } from '../../../../components/shadow';
import type { WorkbenchFileView } from '../../models';
import {
  FIT_LIGHTBOX_TRANSFORM,
  LIGHTBOX_MAX_ZOOM,
  LIGHTBOX_MIN_ZOOM,
  panFromDrag,
  svgToDataUrl,
  zoomAround,
  zoomFromWheel,
  type LightboxTransform,
} from '../results-gallery/results-gallery-state';

interface DragState {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly transform: LightboxTransform;
}

export class ProcessedCanvasTemplate extends HTMLElement {
  private readonly viewport: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly empty: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly zoomLevel: HTMLElement;
  private readonly zoomOutButton: HTMLButtonElement;
  private readonly zoomInButton: HTMLButtonElement;
  private readonly fitButton: HTMLButtonElement;
  private fileValue: WorkbenchFileView | undefined;
  private renderedFileId: string | undefined;
  private renderedSvg: string | undefined;
  private transform: LightboxTransform = FIT_LIGHTBOX_TRANSFORM;
  private drag: DragState | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private resizeFallbackAttached = false;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.viewport = requiredElement(root, '.viewer-viewport');
    this.image = requiredElement(root, '.viewer-image');
    this.empty = requiredElement(root, '.viewer-empty');
    this.toolbar = requiredElement(root, '.viewer-toolbar');
    this.zoomLevel = requiredElement(root, '.zoom-level');
    this.zoomOutButton = requiredElement(root, '.zoom-out');
    this.zoomInButton = requiredElement(root, '.zoom-in');
    this.fitButton = requiredElement(root, '.fit-button');

    this.fitButton.addEventListener('click', () => this.resetTransform());
    this.zoomInButton.addEventListener('click', () => this.stepZoom(1.25));
    this.zoomOutButton.addEventListener('click', () => this.stepZoom(0.8));
    this.viewport.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.viewport.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.viewport.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.viewport.addEventListener('pointerup', (event) => this.onPointerEnd(event));
    this.viewport.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
  }

  set file(value: WorkbenchFileView | undefined) {
    this.fileValue = value;
    this.sync();
  }

  get file(): WorkbenchFileView | undefined {
    return this.fileValue;
  }

  connectedCallback(): void {
    upgradeProperty(this, 'file');
    this.installResizeTracking();
    this.sync();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.resizeFallbackAttached) {
      window.removeEventListener('resize', this.onViewportResize);
      this.resizeFallbackAttached = false;
    }
  }

  private sync(): void {
    const fileId = this.fileValue?.id;
    const svg = this.fileValue?.generation?.status === 'generated' ? this.fileValue.generation.svg : undefined;
    const hasSvg = Boolean(svg);
    this.empty.hidden = hasSvg;
    this.toolbar.hidden = !hasSvg;
    this.image.hidden = !hasSvg;

    if (!svg) {
      this.renderedFileId = undefined;
      this.renderedSvg = undefined;
      this.image.removeAttribute('src');
      this.image.alt = '';
      this.cancelDrag();
      this.resetTransform();
      return;
    }

    if (fileId !== this.renderedFileId || svg !== this.renderedSvg) {
      this.renderedFileId = fileId;
      this.renderedSvg = svg;
      this.image.src = svgToDataUrl(svg);
      this.image.alt = 'Resultado procesado seleccionado';
      this.cancelDrag();
      this.resetTransform();
    }
  }

  private installResizeTracking(): void {
    if (typeof ResizeObserver !== 'undefined') {
      if (this.resizeObserver !== undefined) return;
      this.resizeObserver = new ResizeObserver(() => this.onViewportResize());
      this.resizeObserver.observe(this.viewport);
      return;
    }
    if (this.resizeFallbackAttached) return;
    window.addEventListener('resize', this.onViewportResize);
    this.resizeFallbackAttached = true;
  }

  private readonly onViewportResize = (): void => {
    if (!this.renderedSvg || this.transform.zoom <= LIGHTBOX_MIN_ZOOM) return;
    const { width, height } = this.viewportSize();
    this.transform = panFromDrag(this.transform, 0, 0, width, height);
    this.applyTransform();
  };

  private viewportSize(): { readonly width: number; readonly height: number } {
    const rect = this.viewport.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  private onWheel(event: WheelEvent): void {
    if (!this.renderedSvg) return;
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
    if (!this.renderedSvg) return;
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
    this.image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    this.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    this.viewport.classList.toggle('can-pan', zoom > LIGHTBOX_MIN_ZOOM);
    this.zoomOutButton.disabled = zoom <= LIGHTBOX_MIN_ZOOM;
    this.zoomInButton.disabled = zoom >= LIGHTBOX_MAX_ZOOM;
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.renderedSvg || this.transform.zoom <= LIGHTBOX_MIN_ZOOM || event.button !== 0) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, transform: this.transform };
    this.viewport.classList.add('dragging');
    if ('setPointerCapture' in this.viewport) this.viewport.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const { width, height } = this.viewportSize();
    this.transform = panFromDrag(this.drag.transform, event.clientX - this.drag.x, event.clientY - this.drag.y, width, height);
    this.applyTransform();
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if ('hasPointerCapture' in this.viewport && this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    this.cancelDrag();
  }

  private cancelDrag(): void {
    this.drag = undefined;
    this.viewport.classList.remove('dragging');
  }
}

if (!customElements.get('pw-processed-canvas-template')) customElements.define('pw-processed-canvas-template', ProcessedCanvasTemplate);
