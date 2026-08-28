import { File as NodeFile } from 'node:buffer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const distDir = path.join(rootDir, 'dist');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function installGlobal(name, value, restore) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  restore.push(() => {
    if (descriptor === undefined) delete globalThis[name];
    else Object.defineProperty(globalThis, name, descriptor);
  });
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function required(root, selector, label) {
  const element = root?.querySelector(selector);
  if (!element) throw new Error(`El probe no encontró ${label}.`);
  return element;
}

function surface(workbench) {
  const shell = required(workbench.shadowRoot, 'pw-workbench-shell', 'el shell del workbench');
  const sourceQueue = required(shell.shadowRoot, 'pw-source-queue-template', 'la plantilla de fuente y cola');
  return {
    sourceName: required(sourceQueue.shadowRoot, '.source-file strong', 'el nombre de fuente'),
    sourceMessage: required(sourceQueue.shadowRoot, '.source-file .message', 'el mensaje de fuente'),
    queue: required(sourceQueue.shadowRoot, '.queue', 'la cola de SVG'),
  };
}

function queueRowSnapshot(queue, fileName) {
  const buttons = [...queue.shadowRoot.querySelectorAll('button')];
  const button = buttons.find((candidate) => candidate.querySelector('strong')?.textContent === fileName);
  if (!button) return null;
  const primary = button.querySelector('strong')?.textContent ?? '';
  const secondary = button.querySelector('small')?.textContent ?? '';
  const meta = button.querySelector('.meta')?.textContent ?? '';
  return `${primary}|${secondary}|${meta}`;
}

class GatedFile extends NodeFile {
  constructor(parts, name, options, gatedMethod) {
    super(parts, name, options);
    this.gatedMethod = gatedMethod;
    this.gate = new Promise((resolve) => { this.releaseGate = resolve; });
  }

  release() {
    this.releaseGate();
  }

  async arrayBuffer() {
    if (this.gatedMethod === 'arrayBuffer') await this.gate;
    return super.arrayBuffer();
  }

  async text() {
    if (this.gatedMethod === 'text') await this.gate;
    return super.text();
  }
}

async function settleRender() {
  await Promise.resolve();
  await Promise.resolve();
}

async function moduleEntry() {
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  const source = html.match(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/iu)?.[1];
  if (!source) throw new Error('El probe no encontró el entrypoint de módulo en dist/index.html.');
  return path.resolve(distDir, source.replace(/^\.\//u, ''));
}

async function main() {
  const dom = new JSDOM('<!doctype html><html lang="es"><body><main id="app"></main></body></html>', {
    url: 'https://probe.local/precios/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const restore = [];
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    customElements: window.customElements,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    DocumentFragment: window.DocumentFragment,
    HTMLTemplateElement: window.HTMLTemplateElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLProgressElement: window.HTMLProgressElement,
    DOMParser: window.DOMParser,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
    MutationObserver: window.MutationObserver,
    File: NodeFile,
  };

  try {
    for (const [name, value] of Object.entries(globals)) installGlobal(name, value, restore);
    await import(`${pathToFileURL(await moduleEntry()).href}?upload-feedback-probe=${Date.now()}`);

    const workbench = window.document.querySelector('pw-price-workbench');
    assert(workbench, 'El workbench no se montó en el probe de feedback.');
    assert(window.preciosApp, 'La Control API no quedó disponible en el probe de feedback.');
    const ui = surface(workbench);

    const sourceFile = new GatedFile(['LOCAL;PRECIO\nEjemplo;1000\n'], 'precios-probe.csv', { type: 'text/csv' }, 'arrayBuffer');
    const sourceBefore = `${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    const sourceTask = window.preciosApp.execute('source.load', { files: [sourceFile] });
    assert(workbench.model.source.status === 'loading', 'SOURCE no publicó loading en el mismo ciclo de interacción.');
    await settleRender();
    const sourceImmediate = `${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    assert(workbench.model.source.status === 'loading', 'SOURCE terminó antes de observar el estado intermedio bloqueado.');
    assert(workbench.model.source.fileName === sourceFile.name, 'SOURCE no publicó el nombre del archivo inmediatamente.');
    assert(workbench.model.source.message?.includes('Procesando'), 'SOURCE no publicó un mensaje de procesamiento inmediato.');
    assert(ui.sourceName.textContent === sourceFile.name, 'SOURCE no proyectó el nombre al DOM antes de leer el archivo.');
    assert(ui.sourceMessage.textContent.includes('Procesando'), 'SOURCE no proyectó Procesando al DOM antes de leer el archivo.');
    assert(sourceImmediate !== sourceBefore, 'SOURCE dejó la superficie visual idéntica antes del parsing.');
    sourceFile.release();
    await sourceTask;
    await settleRender();
    const sourceFinal = `${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    assert(workbench.model.source.status === 'ready' || workbench.model.source.status === 'error', 'SOURCE no alcanzó un estado final observable.');
    assert(workbench.model.source.status !== 'loading', 'SOURCE dejó loading activo después de finalizar.');
    assert(sourceFinal !== sourceImmediate, 'SOURCE no produjo una transición visual final.');

    const svgFile = new GatedFile([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="4" y="16">$$$$</text><text x="4" y="34">@@@@</text></svg>',
    ], 'local-probe.svg', { type: 'image/svg+xml' }, 'text');
    const svgBefore = queueRowSnapshot(ui.queue, svgFile.name);
    const svgTask = window.preciosApp.execute('svg.load', { files: [svgFile] });
    assert(workbench.model.svgLoadStatus === 'loading', 'SVG no publicó loading en el mismo ciclo de interacción.');
    await settleRender();
    const svgImmediate = queueRowSnapshot(ui.queue, svgFile.name);
    assert(workbench.model.svgLoadStatus === 'loading', 'SVG terminó antes de observar la cola previa al análisis.');
    assert(workbench.model.files.some((file) => file.fileName === svgFile.name), 'SVG no apareció inmediatamente en el view-model de cola.');
    assert(svgBefore === null && svgImmediate !== null, 'SVG no agregó una fila DOM antes del análisis.');
    assert(svgImmediate.includes('Matching pendiente'), 'SVG no proyectó un estado pendiente observable antes del análisis.');
    svgFile.release();
    await svgTask;
    await settleRender();
    const svgFinal = queueRowSnapshot(ui.queue, svgFile.name);
    assert(workbench.model.svgLoadStatus === 'ready' || workbench.model.svgLoadStatus === 'error', 'SVG no alcanzó un estado final observable.');
    assert(workbench.model.svgLoadStatus !== 'loading', 'SVG dejó loading activo después de finalizar.');
    assert(svgFinal !== null && svgFinal !== svgImmediate, 'SVG no produjo una transición visual final en su fila DOM.');

    const fontFile = new GatedFile(['fuente-probe-invalida'], 'fuente-probe.ttf', { type: 'font/ttf' }, 'arrayBuffer');
    const fontTask = window.preciosApp.execute('font.load', { files: [fontFile] });
    assert(workbench.model.fontLoadStatus === 'loading', 'FONT no publicó loading en el mismo ciclo de interacción.');
    fontFile.release();
    await fontTask;
    assert(workbench.model.fontLoadStatus === 'ready' || workbench.model.fontLoadStatus === 'error', 'FONT no alcanzó un estado final observable.');
    assert(workbench.model.fontLoadStatus !== 'loading', 'FONT dejó loading activo después de finalizar.');

    console.log(JSON.stringify({
      probe: 'upload-feedback',
      source: workbench.model.source.status,
      svg: workbench.model.svgLoadStatus,
      fonts: workbench.model.fontLoadStatus,
      files: workbench.model.files.length,
    }));
  } finally {
    while (restore.length > 0) restore.pop()();
    dom.window.close();
  }
}

await main();
