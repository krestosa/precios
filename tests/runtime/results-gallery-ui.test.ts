// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkbenchFileView } from '../../src/features/ui/models';
import {
  FIT_LIGHTBOX_TRANSFORM,
  LIGHTBOX_MAX_ZOOM,
  deriveGalleryItems,
  panFromDrag,
  svgToDataUrl,
  zoomFromWheel,
} from '../../src/features/ui/templates/results-gallery/results-gallery-state';
import { ResultsGalleryTemplate } from '../../src/features/ui/templates/results-gallery/results-gallery';

const RESULT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="4" y="24">123</text></svg>';

function generatedFile(overrides: Partial<WorkbenchFileView> = {}): WorkbenchFileView {
  return {
    id: 'output-a',
    fileName: 'output-a.svg',
    processingState: 'ready',
    rawGroup: 'Grupo dinámico',
    generation: {
      status: 'generated',
      classification: 'price-editable',
      svg: RESULT_SVG,
      targets: [],
      overflow: [],
      diagnostics: [],
    },
    exportable: true,
    ...overrides,
  };
}

describe('results gallery', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it('deriva items desde generation.svg real y conserva outputs bloqueados', () => {
    const blocked = generatedFile({
      id: 'blocked',
      fileName: 'blocked.svg',
      generation: { status: 'skipped', classification: 'price-editable', targets: [], overflow: [], diagnostics: [] },
      derivedTargets: [{ id: 'target-1', pricingGroup: 'Target dinámico', scopes: ['scope-a'], overridden: false, blocking: true }],
      exportable: false,
    });
    const items = deriveGalleryItems([generatedFile(), blocked]);
    expect(items).toHaveLength(2);
    expect(items[0].svg).toBe(RESULT_SVG);
    expect(items[0].exportable).toBe(true);
    expect(items[1]).toMatchObject({ id: 'blocked', statusLabel: 'Bloqueado por pricing', exportable: false, blocked: true });
    expect(items[1].svg).toBeUndefined();
  });

  it('abre el lightbox con el SVG procesado correcto al hacer click', () => {
    const gallery = document.createElement('pw-results-gallery-template') as ResultsGalleryTemplate;
    document.body.append(gallery);
    gallery.files = [generatedFile()];
    const root = gallery.shadowRoot!;
    const trigger = root.querySelector<HTMLButtonElement>('.preview-button')!;
    trigger.click();
    expect(root.querySelector<HTMLElement>('.lightbox')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.lightbox-title')!.textContent).toBe('output-a.svg');
    expect(root.querySelector<HTMLImageElement>('.lightbox-image')!.getAttribute('src')).toBe(svgToDataUrl(RESULT_SVG));
  });

  it('wheel cambia el zoom y respeta los límites', () => {
    const gallery = document.createElement('pw-results-gallery-template') as ResultsGalleryTemplate;
    document.body.append(gallery);
    gallery.files = [generatedFile()];
    const root = gallery.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.preview-button')!.click();
    const viewport = root.querySelector<HTMLElement>('.lightbox-viewport')!;
    Object.defineProperty(viewport, 'getBoundingClientRect', { configurable: true, value: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) });
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: 400, clientY: 300, cancelable: true }));
    expect(root.querySelector<HTMLElement>('.zoom-level')!.textContent).not.toBe('100%');

    let state = FIT_LIGHTBOX_TRANSFORM;
    for (let index = 0; index < 100; index += 1) state = zoomFromWheel(state, -1000, 0, 0, 800, 600);
    expect(state.zoom).toBe(LIGHTBOX_MAX_ZOOM);
    for (let index = 0; index < 100; index += 1) state = zoomFromWheel(state, 1000, 0, 0, 800, 600);
    expect(state).toEqual(FIT_LIGHTBOX_TRANSFORM);
  });

  it('pointer drag modifica pan sólo cuando la imagen está ampliada', () => {
    const zoomed = zoomFromWheel(FIT_LIGHTBOX_TRANSFORM, -500, 0, 0, 800, 600);
    const panned = panFromDrag(zoomed, 120, -80, 800, 600);
    expect(panned.zoom).toBeGreaterThan(1);
    expect(panned.panX).toBeGreaterThan(0);
    expect(panned.panY).toBeLessThan(0);
    expect(panFromDrag(FIT_LIGHTBOX_TRANSFORM, 120, 80, 800, 600)).toEqual(FIT_LIGHTBOX_TRANSFORM);
  });

  it('Escape cierra el modal, libera scroll y reabre en fit', () => {
    const gallery = document.createElement('pw-results-gallery-template') as ResultsGalleryTemplate;
    document.body.append(gallery);
    gallery.files = [generatedFile()];
    const root = gallery.shadowRoot!;
    const trigger = root.querySelector<HTMLButtonElement>('.preview-button')!;
    trigger.click();
    root.querySelector<HTMLButtonElement>('.zoom-in')!.click();
    expect(root.querySelector<HTMLElement>('.zoom-level')!.textContent).not.toBe('100%');
    expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector<HTMLElement>('.lightbox')!.hidden).toBe(true);
    expect(document.body.style.overflow).toBe('');
    trigger.click();
    expect(root.querySelector<HTMLElement>('.zoom-level')!.textContent).toBe('100%');
  });

  it('un output bloqueado no aparece como exportable', () => {
    const gallery = document.createElement('pw-results-gallery-template') as ResultsGalleryTemplate;
    document.body.append(gallery);
    gallery.files = [generatedFile({
      generation: { status: 'skipped', classification: 'price-editable', targets: [], overflow: [], diagnostics: [] },
      derivedTargets: [{ id: 'target-2', pricingGroup: null, scopes: ['scope-b'], overridden: false, blocking: true }],
      exportable: false,
    })];
    const root = gallery.shadowRoot!;
    expect(root.querySelector<HTMLButtonElement>('.export-button')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.state-badge')!.textContent).toBe('Bloqueado por pricing');
  });
});
