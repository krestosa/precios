import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootControlRuntime,
  getPath,
  type ControlApi,
} from './control-api-testkit';

async function fixture(path: string): Promise<string> {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

function asFile(content: string | Uint8Array, name: string, type: string): File {
  return new File([content], name, { type });
}

function createGate(): { readonly wait: Promise<void>; readonly release: () => void } {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function deferredArrayBufferFile(content: string | Uint8Array, name: string, type: string): {
  readonly file: File;
  readonly release: () => void;
} {
  const file = asFile(content, name, type);
  const gate = createGate();
  const read = file.arrayBuffer.bind(file);
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async (): Promise<ArrayBuffer> => {
      await gate.wait;
      return read();
    },
  });
  return { file, release: gate.release };
}

function deferredTextFile(content: string, name: string, type: string): {
  readonly file: File;
  readonly release: () => void;
} {
  const file = asFile(content, name, type);
  const gate = createGate();
  const read = file.text.bind(file);
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: async (): Promise<string> => {
      await gate.wait;
      return read();
    },
  });
  return { file, release: gate.release };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim();
}

function deepElements(root: ParentNode = document): readonly Element[] {
  const result: Element[] = [];
  const visit = (parent: ParentNode): void => {
    for (const element of Array.from(parent.children)) {
      result.push(element);
      visit(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  return result;
}

function deepMatches<T extends Element>(selector: string): readonly T[] {
  return deepElements().filter((element): element is T => element.matches(selector));
}

function visibleText(root: Node = document): string {
  const chunks: string[] = [];
  const visit = (node: Node, hidden: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!hidden && node.textContent) chunks.push(node.textContent);
      return;
    }
    const nextHidden = hidden || (node instanceof HTMLElement && node.hidden);
    if (nextHidden) return;
    if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot, false);
    node.childNodes.forEach((child) => visit(child, false));
  };
  visit(root, false);
  return normalizeText(chunks.join(' '));
}

function findDropzone(label: string): HTMLElement {
  const dropzone = deepMatches<HTMLElement>('pw-file-dropzone')
    .find((candidate) => candidate.getAttribute('label') === label);
  expect(dropzone, `debe existir el dropzone público ${label}`).toBeDefined();
  if (!dropzone) throw new Error(`No existe el dropzone ${label}.`);
  return dropzone;
}

function liveNode(dropzone: HTMLElement): HTMLElement {
  const node = dropzone.shadowRoot?.querySelector<HTMLElement>('[aria-live]') ?? null;
  expect(node, 'el feedback del dropzone debe exponerse con aria-live').not.toBeNull();
  if (!node) throw new Error('El dropzone no expone aria-live.');
  return node;
}

function liveText(dropzone: HTMLElement): string {
  return normalizeText(liveNode(dropzone).textContent);
}

function selectFilesThroughInput(dropzone: HTMLElement, files: readonly File[]): void {
  const input = dropzone.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  expect(input, 'la selección debe pasar por el input público real').not.toBeNull();
  if (!input) throw new Error('No existe el input de archivos del dropzone.');

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function waitForState(api: ControlApi, predicate: (state: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: () => void = () => undefined;
    const accept = (state: unknown): void => {
      if (done || !predicate(state)) return;
      done = true;
      unsubscribe();
      resolve(state);
    };
    const stop = api.subscribe(accept);
    unsubscribe = stop;
    if (done) stop();
    else accept(api.getState());
  });
}

function queueRowText(fileName: string): string {
  const queue = deepMatches<HTMLElement>('pw-data-list')[0];
  expect(queue, 'la cola SVG debe existir en el DOM real').toBeDefined();
  if (!queue?.shadowRoot) return '';
  const row = Array.from(queue.shadowRoot.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => normalizeText(button.textContent).includes(fileName));
  return normalizeText(row?.textContent);
}

function sourceProjection(): Readonly<Record<string, string | boolean>> {
  const dropzone = findDropzone('Cargar fuente local');
  const sourceFile = deepMatches<HTMLElement>('.source-file')[0];
  const sourceName = deepMatches<HTMLElement>('.source-file strong')[0];
  const sourceMessage = deepMatches<HTMLElement>('.source-file .message')[0];
  expect(sourceFile).toBeDefined();
  return {
    status: liveText(dropzone),
    fileVisible: sourceFile ? !sourceFile.hidden : false,
    fileName: normalizeText(sourceName?.textContent),
    message: normalizeText(sourceMessage?.textContent),
  };
}

function expectNoInventedPercentage(): void {
  for (const progress of deepMatches<HTMLElement>('pw-progress')) {
    if (progress.hidden) continue;
    const text = visibleText(progress);
    expect(text, 'un progreso indeterminado no debe inventar un porcentaje').not.toMatch(/\b\d{1,3}%\b/u);
  }
}

async function loadSourceDirect(api: ControlApi): Promise<void> {
  const csv = await fixture('pricing/workflow-prices.csv');
  const result = await api.execute('source.load', {
    files: asFile(csv, 'workflow-prices.csv', 'text/csv'),
  });
  expect(result.ok).toBe(true);
  expect(getPath(api.getState(), 'source', 'status')).toBe('ready');
}

describe('feedback visual productivo de uploads', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('SOURCE cambia inmediatamente a loading, muestra filename y termina con feedback visible', async () => {
    const csv = await fixture('pricing/workflow-prices.csv');
    const upload = deferredArrayBufferFile(csv, 'workflow-prices.csv', 'text/csv');
    const dropzone = findDropzone('Cargar fuente local');
    const initial = visibleText();
    const initialLive = liveText(dropzone);
    expect(liveNode(dropzone).getAttribute('aria-live')).toBe('polite');
    expect(initialLive).toMatch(/Sin archivos/iu);

    const loading = waitForState(api, (state) => getPath(state, 'source', 'status') === 'loading');
    selectFilesThroughInput(dropzone, [upload.file]);
    await loading;

    const during = visibleText();
    expect(during, 'seleccionar una fuente debe cambiar la presentación antes de ready').not.toBe(initial);
    expect(during).toContain('workflow-prices.csv');
    expect(liveText(dropzone)).toMatch(/Cargando/iu);
    expectNoInventedPercentage();

    const ready = waitForState(api, (state) => getPath(state, 'source', 'status') === 'ready');
    upload.release();
    await ready;

    const finalProjection = sourceProjection();
    expect(finalProjection.status).toMatch(/Listo/iu);
    expect(finalProjection.fileVisible).toBe(true);
    expect(finalProjection.fileName).toBe('workflow-prices.csv');
    expect(finalProjection.message, 'la fuente lista debe exponer resumen o metadata visible').not.toBe('');
  });

  it('SVG MULTI crea una fila visible por archivo mientras uno sigue bloqueado y conserva resultados individuales', async () => {
    await loadSourceDirect(api);
    const names = [
      'SIN PRECIO.svg',
      'PRECIO EDITABLE EXISTENTE.svg',
      'ERROR PLACEHOLDER DUPLICADO.svg',
      'ROLL AMBIGUO.svg',
    ] as const;
    const contents = await Promise.all(names.map((name) => fixture(`svg/${name}`)));
    const slow = deferredTextFile(contents[0]!, names[0], 'image/svg+xml');
    const files = [
      slow.file,
      ...names.slice(1).map((name, index) => asFile(contents[index + 1]!, name, 'image/svg+xml')),
    ];
    const dropzone = findDropzone('Cargar SVG');

    const loading = waitForState(api, (state) => getPath(state, 'loads', 'svgStatus') === 'loading');
    selectFilesThroughInput(dropzone, files);
    await loading;

    expect(liveText(dropzone)).toMatch(/Cargando/iu);
    expectNoInventedPercentage();
    for (const name of names) {
      const row = queueRowText(name);
      expect(row, `${name} debe existir antes de que termine el archivo lento`).toContain(name);
      expect(row, `${name} debe tener estado presentacional transitorio`).toMatch(/pendiente|analizando|cargando|procesando|pending|loading/iu);
    }

    const ready = waitForState(api, (state) => getPath(state, 'loads', 'svgStatus') === 'ready'
      && getPath(state, 'counts', 'svgFiles') === names.length);
    slow.release();
    await ready;

    expect(liveText(dropzone)).toMatch(/Listo/iu);
    names.forEach((name) => expect(queueRowText(name)).toContain(name));

    const preflight = await api.execute('preflight.run');
    expect(preflight.ok).toBe(true);
    expect(queueRowText('SIN PRECIO.svg')).toMatch(/\bOK\b/u);
    expect(queueRowText('PRECIO EDITABLE EXISTENTE.svg')).toMatch(/\bWARNING\b/u);
    expect(queueRowText('ERROR PLACEHOLDER DUPLICADO.svg')).toMatch(/\bERROR\b/u);
    expect(queueRowText('ROLL AMBIGUO.svg')).toMatch(/Revisión manual/iu);
    expect(queueRowText('ROLL AMBIGUO.svg')).toMatch(/\bERROR\b/u);
  });

  it('FONT demuestra aceptación visible durante loading y termina en resolución o error observable', async () => {
    const upload = deferredArrayBufferFile(
      new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x00, 0x00, 0x00]),
      'qa-feedback-font.woff2',
      'font/woff2',
    );
    const dropzone = findDropzone('Agregar fuentes locales');
    const initial = visibleText();

    const loading = waitForState(api, (state) => getPath(state, 'loads', 'fontStatus') === 'loading');
    selectFilesThroughInput(dropzone, [upload.file]);
    await loading;

    const during = visibleText();
    expect(during, 'aceptar una fuente debe alterar la presentación inmediatamente').not.toBe(initial);
    expect(during, 'el usuario debe poder identificar qué fuente fue aceptada').toContain('qa-feedback-font.woff2');
    expect(liveText(dropzone)).toMatch(/Cargando/iu);
    expectNoInventedPercentage();

    const completed = waitForState(api, (state) => {
      const status = getPath(state, 'loads', 'fontStatus');
      return status === 'ready' || status === 'error';
    });
    upload.release();
    await completed;

    expect(liveText(dropzone)).toMatch(/Listo|Error/iu);
    const finalText = visibleText();
    expect(
      finalText.includes('qa-feedback-font.woff2')
        || /Cargada|Faltante|No coincide|Error/iu.test(finalText),
      'el feedback final de fuente no puede desaparecer sin resolución o error visible',
    ).toBe(true);
  });

  it('flow.reset elimina filenames, filas y feedback de progreso y vuelve al estado visual inicial', async () => {
    await loadSourceDirect(api);
    const svgName = 'ROLL EXACTO.svg';
    const svg = await fixture(`svg/${svgName}`);
    const svgResult = await api.execute('svg.load', { files: asFile(svg, svgName, 'image/svg+xml') });
    expect(svgResult.ok).toBe(true);
    expect(visibleText()).toContain('workflow-prices.csv');
    expect(visibleText()).toContain(svgName);

    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);

    const text = visibleText();
    expect(text).not.toContain('workflow-prices.csv');
    expect(text).not.toContain(svgName);
    expect(liveText(findDropzone('Cargar fuente local'))).toMatch(/Sin archivos/iu);
    expect(liveText(findDropzone('Cargar SVG'))).toMatch(/Sin archivos/iu);
    expect(liveText(findDropzone('Agregar fuentes locales'))).toMatch(/Sin archivos/iu);
    expect(text).toContain('Cola vacía');
    deepMatches<HTMLElement>('pw-progress').forEach((progress) => expect(progress.hidden).toBe(true));
  });

  it('execute(source.load) y el input público producen la misma proyección visible en loading y ready', async () => {
    const csv = await fixture('pricing/workflow-prices.csv');
    const dropzone = findDropzone('Cargar fuente local');

    const uiUpload = deferredArrayBufferFile(csv, 'workflow-prices.csv', 'text/csv');
    const uiLoadingState = waitForState(api, (state) => getPath(state, 'source', 'status') === 'loading');
    selectFilesThroughInput(dropzone, [uiUpload.file]);
    await uiLoadingState;
    const uiLoading = sourceProjection();
    const uiReadyState = waitForState(api, (state) => getPath(state, 'source', 'status') === 'ready');
    uiUpload.release();
    await uiReadyState;
    const uiReady = sourceProjection();

    expect((await api.execute('flow.reset')).ok).toBe(true);

    const apiUpload = deferredArrayBufferFile(csv, 'workflow-prices.csv', 'text/csv');
    const apiLoadingState = waitForState(api, (state) => getPath(state, 'source', 'status') === 'loading');
    const execution = api.execute('source.load', { files: apiUpload.file });
    await apiLoadingState;
    const apiLoading = sourceProjection();
    const apiReadyState = waitForState(api, (state) => getPath(state, 'source', 'status') === 'ready');
    apiUpload.release();
    expect((await execution).ok).toBe(true);
    await apiReadyState;
    const apiReady = sourceProjection();

    expect(apiLoading).toEqual(uiLoading);
    expect(apiReady).toEqual(uiReady);
  });
});
