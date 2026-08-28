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
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function required(root, selector, label) {
  const element = root?.querySelector(selector);
  if (!element) throw new Error(`El probe no encontró ${label}.`);
  return element;
}

function surface(workbench) {
  const shell = required(workbench.shadowRoot, 'pw-workbench-shell', 'el shell del workbench');
  const sourceQueue = required(shell.shadowRoot, 'pw-source-queue-template', 'la plantilla de fuente y cola');
  const fonts = required(shell.shadowRoot, 'pw-fonts-template', 'la plantilla de fuentes');
  return {
    sourceQueue,
    fonts,
    sourceDropzone: required(sourceQueue.shadowRoot, '.source-dropzone', 'el dropzone de fuente'),
    svgDropzone: required(sourceQueue.shadowRoot, '.svg-dropzone', 'el dropzone de SVG'),
    sourceName: required(sourceQueue.shadowRoot, '.source-file strong', 'el nombre de fuente'),
    sourceMessage: required(sourceQueue.shadowRoot, '.source-file .message', 'el mensaje de fuente'),
    queue: required(sourceQueue.shadowRoot, '.queue', 'la cola de SVG'),
    fontDropzone: required(fonts.shadowRoot, '.font-dropzone', 'el dropzone de fuentes'),
  };
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

    const sourceFile = new NodeFile(['LOCAL;PRECIO\nEjemplo;1000\n'], 'precios-probe.csv', { type: 'text/csv' });
    const sourceBefore = `${ui.sourceDropzone.status}|${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    const sourceTask = window.preciosApp.execute('source.load', { files: [sourceFile] });
    const sourceImmediate = `${ui.sourceDropzone.status}|${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    assert(workbench.model.source.status === 'loading', 'SOURCE no publicó loading en el mismo ciclo de interacción.');
    assert(workbench.model.source.fileName === sourceFile.name, 'SOURCE no publicó el nombre del archivo inmediatamente.');
    assert(workbench.model.source.message?.includes('Procesando'), 'SOURCE no publicó un mensaje de procesamiento inmediato.');
    assert(ui.sourceDropzone.status === 'loading', 'SOURCE no proyectó loading al dropzone real.');
    assert(ui.sourceName.textContent === sourceFile.name, 'SOURCE no proyectó el nombre al DOM real.');
    assert(ui.sourceMessage.textContent.includes('Procesando'), 'SOURCE no proyectó el mensaje de procesamiento al DOM real.');
    assert(sourceImmediate !== sourceBefore, 'SOURCE dejó la superficie visual idéntica después de seleccionar el archivo.');
    await sourceTask;
    const sourceFinal = `${ui.sourceDropzone.status}|${ui.sourceName.textContent}|${ui.sourceMessage.textContent}`;
    assert(workbench.model.source.status === 'ready' || workbench.model.source.status === 'error', 'SOURCE no alcanzó un estado final observable.');
    assert(workbench.model.source.status !== 'loading', 'SOURCE dejó loading activo después de finalizar.');
    assert(ui.sourceDropzone.status !== 'loading', 'SOURCE dejó el dropzone visual en loading después de finalizar.');
    assert(sourceFinal !== sourceImmediate, 'SOURCE no produjo una transición visual final.');

    const svgFile = new NodeFile([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="4" y="16">$$$$</text><text x="4" y="34">@@@@</text></svg>',
    ], 'local-probe.svg', { type: 'image/svg+xml' });
    const svgBeforeCount = ui.queue.items.length;
    const svgTask = window.preciosApp.execute('svg.load', { files: [svgFile] });
    const immediateItem = ui.queue.items.find((item) => item.primary === svgFile.name);
    assert(workbench.model.svgLoadStatus === 'loading', 'SVG no publicó loading en el mismo ciclo de interacción.');
    assert(workbench.model.files.some((file) => file.fileName === svgFile.name), 'SVG no apareció inmediatamente en la cola observable.');
    assert(ui.svgDropzone.status === 'loading', 'SVG no proyectó loading al dropzone real.');
    assert(ui.queue.items.length > svgBeforeCount && immediateItem, 'SVG no agregó inmediatamente una fila a la cola visual.');
    assert(immediateItem.secondary?.includes('Matching pendiente'), 'SVG no proyectó un estado pendiente observable en la fila inmediata.');
    await svgTask;
    const finalItem = ui.queue.items.find((item) => item.primary === svgFile.name);
    assert(workbench.model.svgLoadStatus === 'ready' || workbench.model.svgLoadStatus === 'error', 'SVG no alcanzó un estado final observable.');
    assert(workbench.model.svgLoadStatus !== 'loading', 'SVG dejó loading activo después de finalizar.');
    assert(ui.svgDropzone.status !== 'loading', 'SVG dejó el dropzone visual en loading después de finalizar.');
    assert(finalItem && (finalItem.secondary !== immediateItem.secondary || finalItem.meta !== immediateItem.meta), 'SVG no produjo una transición visual final en su fila.');

    const fontFile = new NodeFile(['fuente-probe-invalida'], 'fuente-probe.ttf', { type: 'font/ttf' });
    const fontTask = window.preciosApp.execute('font.load', { files: [fontFile] });
    assert(workbench.model.fontLoadStatus === 'loading', 'FONT no publicó loading en el mismo ciclo de interacción.');
    assert(ui.fontDropzone.status === 'loading', 'FONT no proyectó loading al dropzone real.');
    await fontTask;
    assert(workbench.model.fontLoadStatus === 'ready' || workbench.model.fontLoadStatus === 'error', 'FONT no alcanzó un estado final observable.');
    assert(workbench.model.fontLoadStatus !== 'loading', 'FONT dejó loading activo después de finalizar.');
    assert(ui.fontDropzone.status !== 'loading', 'FONT dejó el dropzone visual en loading después de finalizar.');

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
