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

function shadowText(root) {
  const parts = [];
  const visit = (node) => {
    if (node.nodeType === 3 && node.textContent) parts.push(node.textContent);
    if (node instanceof node.ownerDocument.defaultView.Element && node.shadowRoot) visit(node.shadowRoot);
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
    File: NodeFile,
  };

  try {
    for (const [name, value] of Object.entries(globals)) installGlobal(name, value, restore);
    await import(`${pathToFileURL(await moduleEntry()).href}?upload-feedback-probe=${Date.now()}`);

    const workbench = window.document.querySelector('pw-price-workbench');
    assert(workbench, 'El workbench no se montó en el probe de feedback.');
    assert(window.preciosApp, 'La Control API no quedó disponible en el probe de feedback.');

    const beforeSourceText = shadowText(workbench);
    const sourceFile = new NodeFile(['LOCAL;PRECIO\nEjemplo;1000\n'], 'precios-probe.csv', { type: 'text/csv' });
    const sourceTask = window.preciosApp.execute('source.load', { files: [sourceFile] });
    const sourceImmediateText = shadowText(workbench);
    assert(workbench.model.source.status === 'loading', 'SOURCE no publicó loading en el mismo ciclo de interacción.');
    assert(workbench.model.source.fileName === sourceFile.name, 'SOURCE no publicó el nombre del archivo inmediatamente.');
    assert(workbench.model.source.message?.includes('Procesando'), 'SOURCE no publicó un mensaje de procesamiento inmediato.');
    assert(sourceImmediateText !== beforeSourceText && sourceImmediateText.includes(sourceFile.name), 'SOURCE no produjo un cambio visual inmediato en el DOM.');
    await sourceTask;
    const sourceFinalText = shadowText(workbench);
    assert(workbench.model.source.status === 'ready' || workbench.model.source.status === 'error', 'SOURCE no alcanzó un estado final observable.');
    assert(workbench.model.source.status !== 'loading', 'SOURCE dejó loading activo después de finalizar.');
    assert(sourceFinalText !== sourceImmediateText, 'SOURCE no produjo una transición visual final.');

    const beforeSvgText = shadowText(workbench);
    const svgFile = new NodeFile([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="4" y="16">$$$$</text><text x="4" y="34">@@@@</text></svg>',
    ], 'local-probe.svg', { type: 'image/svg+xml' });
    const svgTask = window.preciosApp.execute('svg.load', { files: [svgFile] });
    const svgImmediateText = shadowText(workbench);
    assert(workbench.model.svgLoadStatus === 'loading', 'SVG no publicó loading en el mismo ciclo de interacción.');
    assert(workbench.model.files.some((file) => file.fileName === svgFile.name), 'SVG no apareció inmediatamente en la cola observable.');
    assert(svgImmediateText !== beforeSvgText && svgImmediateText.includes(svgFile.name), 'SVG no produjo un cambio visual inmediato en el DOM.');
    await svgTask;
    const svgFinalText = shadowText(workbench);
    assert(workbench.model.svgLoadStatus === 'ready' || workbench.model.svgLoadStatus === 'error', 'SVG no alcanzó un estado final observable.');
    assert(workbench.model.svgLoadStatus !== 'loading', 'SVG dejó loading activo después de finalizar.');
    assert(svgFinalText !== svgImmediateText, 'SVG no produjo una transición visual final.');

    const fontFile = new NodeFile(['fuente-probe-invalida'], 'fuente-probe.ttf', { type: 'font/ttf' });
    const fontTask = window.preciosApp.execute('font.load', { files: [fontFile] });
    assert(workbench.model.fontLoadStatus === 'loading', 'FONT no publicó loading en el mismo ciclo de interacción.');
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
