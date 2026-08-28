// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchFileView } from '../../src/features/ui/models';
import { ProcessedCanvasTemplate } from '../../src/features/ui/templates/processed-canvas/processed-canvas';
import { ResultsGalleryTemplate } from '../../src/features/ui/templates/results-gallery/results-gallery';
import {
  FIT_LIGHTBOX_TRANSFORM,
  panFromDrag,
  svgToDataUrl,
  zoomFromWheel,
  type LightboxTransform,
} from '../../src/features/ui/templates/results-gallery/results-gallery-state';

const shellMarkup = readFileSync(new URL('../../src/features/ui/templates/workbench-shell/workbench-shell.html', import.meta.url), 'utf8');
const RESULT_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="4" y="24">A</text></svg>';
const RESULT_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="4" y="24">B</text></svg>';

function generatedFile(id: string, svg: string): WorkbenchFileView {
  return {
    id,
    fileName: `${id}.svg`,
    processingState: 'ready',
    generation: {
      status: 'generated',
      classification: 'price-editable',
      svg,
      targets: [],
      overflow: [],
      diagnostics: [],
    },
    exportable: true,
  };
}

function parsedShell(): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = shellMarkup;
  return template.content.firstElementChild as HTMLElement;
}

function transformStyle(transform: LightboxTransform): string {
  return `translate3d(${transform.panX}px, ${transform.panY}px, 0) scale(${transform.zoom})`;
}

describe('W23 dashboard center canvas', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('reserva el centro exclusivamente al visor de un output procesado', () => {
    const app = parsedShell();
    const center = app.querySelector<HTMLElement>('#results-section')!;
    expect(center.classList.contains('canvas-region')).toBe(true);
    expect([...center.children].map((node) => node.tagName)).toEqual(['PW-PROCESSED-CANVAS-TEMPLATE']);
    expect(center.querySelector('pw-results-gallery-template, pw-review-template, pw-source-queue-template, pw-fonts-template, pw-preflight-template, pw-export-template, pw-panel')).toBeNull();
  });

  it('mantiene el selector de múltiples outputs fuera del canvas y dentro del inspector', () => {
    const app = parsedShell();
    const center = app.querySelector<HTMLElement>('#results-section')!;
    const inspector = app.querySelector<HTMLElement>('#dashboard-inspector')!;
    const selector = inspector.querySelector<HTMLElement>('pw-results-gallery-template[compact]');
    expect(selector).not.toBeNull();
    expect(center.contains(selector)).toBe(false);
    expect(inspector.querySelector('#source-section')).not.toBeNull();
    expect(inspector.querySelector('#review-section')).not.toBeNull();
    expect(inspector.querySelector('#validation-section')).not.toBeNull();
    expect(inspector.querySelector('#export-section')).not.toBeNull();
  });

  it('usa generation.svg del output seleccionado como fuente real del canvas', () => {
    const canvas = document.createElement('pw-processed-canvas-template') as ProcessedCanvasTemplate;
    document.body.append(canvas);
    canvas.file = generatedFile('output-a', RESULT_A);
    const image = canvas.shadowRoot!.querySelector<HTMLImageElement>('.viewer-image')!;
    expect(image.getAttribute('src')).toBe(svgToDataUrl(RESULT_A));
    canvas.file = generatedFile('output-b', RESULT_B);
    expect(image.getAttribute('src')).toBe(svgToDataUrl(RESULT_B));
    expect(image.alt).toBe('Resultado procesado seleccionado');
  });

  it('mantiene el empty state centrado dentro del propio canvas cuando no hay output', () => {
    const canvas = document.createElement('pw-processed-canvas-template') as ProcessedCanvasTemplate;
    document.body.append(canvas);
    const root = canvas.shadowRoot!;
    const viewer = root.querySelector<HTMLElement>('.viewer')!;
    const empty = root.querySelector<HTMLElement>('.viewer-empty')!;
    const image = root.querySelector<HTMLImageElement>('.viewer-image')!;
    expect(viewer.contains(empty)).toBe(true);
    expect(empty.hidden).toBe(false);
    expect(image.hidden).toBe(true);
  });

  it('permite elegir otro output desde el selector lateral sin usar el canvas como lista', () => {
    const gallery = document.createElement('pw-results-gallery-template') as ResultsGalleryTemplate;
    document.body.append(gallery);
    gallery.files = [generatedFile('output-a', RESULT_A), generatedFile('output-b', RESULT_B)];
    gallery.selectedFileId = 'output-a';
    let selectedId = '';
    gallery.addEventListener('ui:file-activate', (event) => { selectedId = (event as CustomEvent<{ readonly id: string }>).detail.id; });
    const buttons = [...gallery.shadowRoot!.querySelectorAll<HTMLButtonElement>('.select-button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    buttons[1]!.click();
    expect(selectedId).toBe('output-b');
  });

  it('reinicia zoom y pan al cambiar de output aunque ambos tengan el mismo generation.svg', () => {
    const canvas = document.createElement('pw-processed-canvas-template') as ProcessedCanvasTemplate;
    document.body.append(canvas);
    canvas.file = generatedFile('output-a', RESULT_A);
    const root = canvas.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.zoom-in')!.click();
    expect(root.querySelector<HTMLElement>('.zoom-level')!.textContent).not.toBe('100%');

    canvas.file = generatedFile('output-b', RESULT_A);
    expect(root.querySelector<HTMLElement>('.zoom-level')!.textContent).toBe('100%');
    expect(root.querySelector<HTMLImageElement>('.viewer-image')!.style.transform).toBe(transformStyle(FIT_LIGHTBOX_TRANSFORM));
  });

  it('restringe el pan al nuevo viewport cuando el canvas cambia de tamaño', () => {
    const canvas = document.createElement('pw-processed-canvas-template') as ProcessedCanvasTemplate;
    document.body.append(canvas);
    const root = canvas.shadowRoot!;
    const viewport = root.querySelector<HTMLElement>('.viewer-viewport')!;
    const image = root.querySelector<HTMLImageElement>('.viewer-image')!;
    let width = 800;
    const height = 600;
    Object.defineProperty(viewport, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }),
    });
    canvas.file = generatedFile('output-a', RESULT_A);

    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, clientX: 800, clientY: 300, cancelable: true }));
    const zoomed = zoomFromWheel(FIT_LIGHTBOX_TRANSFORM, -500, 400, 0, 800, 600);
    expect(image.style.transform).toBe(transformStyle(zoomed));

    width = 200;
    window.dispatchEvent(new Event('resize'));
    const constrained = panFromDrag(zoomed, 0, 0, 200, 600);
    expect(image.style.transform).toBe(transformStyle(constrained));
  });

  it('tolera teardown cuando window ya no está disponible', () => {
    const canvas = document.createElement('pw-processed-canvas-template') as ProcessedCanvasTemplate;
    document.body.append(canvas);
    vi.stubGlobal('window', undefined);
    try {
      expect(() => canvas.disconnectedCallback()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
