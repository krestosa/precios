import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkbenchViewModel } from '../../src/features/ui/models';
import '../../src/features/ui/workbench';
import {
  bootControlRuntime,
  containsScalar,
  getPath,
  isRecord,
  type ControlApi,
} from './control-api-testkit';
import {
  AUXILIARY_SHEET_NAME,
  HIDDEN_SHEET_NAMES,
  MATRIX_SHEET_SPECS,
  SYNTHETIC_SHEET_ORDER,
  createGrowingWorkbookBytes,
} from '../fixtures/workbook/growing-workbook.fixture';
import { readFile } from 'node:fs/promises';

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

type WorkbenchHost = HTMLElement & { model: WorkbenchViewModel };

function sheetViews() {
  return SYNTHETIC_SHEET_ORDER.map((name, index) => ({
    name,
    index,
    visibility: index < HIDDEN_SHEET_NAMES.length ? 'hidden' as const : 'visible' as const,
    supportStatus: name === AUXILIARY_SHEET_NAME ? 'unsupported' as const : 'supported' as const,
    ...(name === AUXILIARY_SHEET_NAME ? { message: 'Estructura auxiliar no compatible.' } : {}),
  }));
}

function baseModel(source: WorkbenchViewModel['source']): WorkbenchViewModel {
  return {
    source,
    svgLoadStatus: 'empty',
    files: [],
    fonts: [],
    fontLoadStatus: 'empty',
  };
}

function mountDetachedWorkbench(model: WorkbenchViewModel): WorkbenchHost {
  const workbench = document.createElement('pw-price-workbench') as WorkbenchHost;
  document.body.replaceChildren(workbench);
  workbench.model = model;
  return workbench;
}

function sheetSelect(): HTMLSelectElement {
  const select = deepMatches<HTMLSelectElement>('select.sheet-select')[0];
  expect(select, 'debe existir el selector nativo de hoja').toBeDefined();
  if (!select) throw new Error('No existe el selector de hoja.');
  return select;
}

function sheetSelectorContainer(): HTMLElement {
  const container = deepMatches<HTMLElement>('.sheet-selector')[0];
  expect(container).toBeDefined();
  if (!container) throw new Error('No existe el contenedor del selector de hoja.');
  return container;
}

function findDropzone(label: string): HTMLElement {
  const dropzone = deepMatches<HTMLElement>('pw-file-dropzone')
    .find((candidate) => candidate.getAttribute('label') === label);
  expect(dropzone, `debe existir el dropzone ${label}`).toBeDefined();
  if (!dropzone) throw new Error(`No existe el dropzone ${label}.`);
  return dropzone;
}

function liveText(dropzone: HTMLElement): string {
  const node = dropzone.shadowRoot?.querySelector<HTMLElement>('[aria-live]') ?? null;
  expect(node).not.toBeNull();
  return normalizeText(node?.textContent);
}

function selectFilesThroughInput(dropzone: HTMLElement, files: readonly File[]): void {
  const input = dropzone.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  expect(input).not.toBeNull();
  if (!input) throw new Error('No existe el input público del dropzone.');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function createGate(): { readonly wait: Promise<void>; readonly release: () => void } {
  let release: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

function deferredWorkbookFile(): { readonly file: File; readonly release: () => void } {
  const file = new File([createGrowingWorkbookBytes()], 'precios-crecientes.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function currentWorkbench(): WorkbenchHost {
  const workbench = document.querySelector('pw-price-workbench') as WorkbenchHost | null;
  expect(workbench).not.toBeNull();
  if (!workbench) throw new Error('No existe el workbench productivo.');
  return workbench;
}

interface CapturedProjection {
  readonly model: WorkbenchViewModel;
  readonly text: string;
}

function waitForProjection(
  workbench: WorkbenchHost,
  predicate: (model: WorkbenchViewModel) => boolean,
): Promise<CapturedProjection> {
  return new Promise((resolve) => {
    let done = false;
    const inspect = (): void => {
      if (done || !predicate(workbench.model)) return;
      done = true;
      workbench.removeEventListener('pw:state-change', inspect);
      resolve({ model: cloneJson(workbench.model), text: visibleText() });
    };
    workbench.addEventListener('pw:state-change', inspect);
    inspect();
  });
}

function chooseSheet(name: string): void {
  const select = sheetSelect();
  select.value = name;
  select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function sheetFinal(model: WorkbenchViewModel, name: string): boolean {
  const source = model.source;
  return source.selectedSheetName === name
    && (source.sheetProcessingState === 'ready' || source.sheetProcessingState === 'warning')
    && source.selectedSheetSummary !== undefined;
}

async function svgFixture(name: string): Promise<File> {
  const content = await readFile(new URL(`../fixtures/svg/${name}`, import.meta.url), 'utf8');
  return new File([content], name, { type: 'image/svg+xml' });
}

describe('W4 selector multi-hoja', () => {
  it('renderiza 59 hojas en orden, conserva placeholder y emite pw:sheet-select exacto', () => {
    const sheets = sheetViews();
    const workbench = mountDetachedWorkbench(baseModel({
      status: 'ready',
      fileName: 'precios-crecientes.xlsx',
      capabilities: { csv: true, xlsx: true, xls: true },
      sheets,
      suggestedSheetName: '01092026',
      sheetSelectionRequired: true,
    }));

    const select = sheetSelect();
    expect(sheetSelectorContainer().hidden).toBe(false);
    expect(select.options).toHaveLength(60);
    expect(select.options[0]?.value).toBe('');
    expect(select.options[0]?.disabled).toBe(true);
    expect(select.options[0]?.textContent).toBe('Seleccioná una hoja');
    expect(select.value).toBe('');
    expect(Array.from(select.options).slice(1).map((option) => option.value)).toEqual(SYNTHETIC_SHEET_ORDER);

    HIDDEN_SHEET_NAMES.forEach((name) => {
      const option = Array.from(select.options).find((candidate) => candidate.value === name);
      expect(option?.textContent).toBe(`${name} · Oculta`);
    });
    expect(Array.from(select.options).find((option) => option.value === '01092026')?.textContent).toBe('01092026');

    const unsupported = Array.from(select.options).find((option) => option.value === AUXILIARY_SHEET_NAME);
    expect(unsupported).toBeDefined();
    expect(unsupported?.disabled).toBe(false);
    expect(unsupported?.textContent).toContain('Estructura no compatible');

    let detail: unknown;
    workbench.addEventListener('pw:sheet-select', (event) => {
      detail = (event as CustomEvent).detail;
    });
    select.value = AUXILIARY_SHEET_NAME;
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(detail).toEqual({ sheetName: AUXILIARY_SHEET_NAME });
  });

  it('distingue hojas ocultas y muy ocultas en el texto del selector', () => {
    mountDetachedWorkbench(baseModel({
      status: 'ready',
      fileName: 'visibilidad.xlsx',
      capabilities: { csv: true, xlsx: true, xls: true },
      sheets: [
        { name: 'OCULTA', index: 0, visibility: 'hidden' },
        { name: 'MUY OCULTA', index: 1, visibility: 'veryHidden' },
      ],
      sheetSelectionRequired: true,
    }));

    const labels = Array.from(sheetSelect().options).slice(1).map((option) => option.textContent);
    expect(labels).toEqual(['OCULTA · Oculta', 'MUY OCULTA · Muy oculta']);
  });

  it('muestra resumen variable y no falsea cero grupos ÉMINENT cuando no fueron detectados', () => {
    const workbench = mountDetachedWorkbench(baseModel({
      status: 'ready',
      fileName: 'precios-crecientes.xlsx',
      capabilities: { csv: true, xlsx: true, xls: true },
      sheets: sheetViews(),
      selectedSheetName: '01062026',
      sheetProcessingState: 'ready',
      selectedSheetSummary: {
        rowCount: 85,
        columnCount: 49,
        normalGroupCount: 23,
      },
    }));

    expect(visibleText()).toContain('85 filas · 49 columnas · 23 grupos NORMAL · ÉMINENT no detectado');
    expect(visibleText()).not.toContain('0 grupos ÉMINENT');

    workbench.model = baseModel({
      status: 'ready',
      fileName: 'precios-crecientes.xlsx',
      capabilities: { csv: true, xlsx: true, xls: true },
      sheets: sheetViews(),
      selectedSheetName: '01072026',
      sheetProcessingState: 'warning',
      selectedSheetSummary: {
        rowCount: 85,
        columnCount: 96,
        normalGroupCount: 22,
        eminentGroupCount: 23,
      },
    });
    expect(visibleText()).toContain('85 filas · 96 columnas · 22 grupos NORMAL · 23 grupos ÉMINENT');
  });

  it('mantiene selector ante hoja incompatible y no lo muestra para CSV', () => {
    const workbench = mountDetachedWorkbench(baseModel({
      status: 'error',
      fileName: 'precios-crecientes.xlsx',
      capabilities: { csv: true, xlsx: true, xls: true },
      sheets: sheetViews(),
      selectedSheetName: AUXILIARY_SHEET_NAME,
      sheetProcessingState: 'error',
      sheetMessage: 'La hoja seleccionada no es compatible.',
    }));

    expect(sheetSelectorContainer().hidden).toBe(false);
    expect(sheetSelect().value).toBe(AUXILIARY_SHEET_NAME);
    expect(visibleText()).toContain('Error de estructura en esta hoja');

    workbench.model = baseModel({
      status: 'ready',
      fileName: 'precios.csv',
      capabilities: { csv: true, xlsx: true, xls: true },
    });
    expect(sheetSelectorContainer().hidden).toBe(true);
  });
});

describe('flujo integrado XLSX con selección explícita', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('combina feedback inmediato de upload con espera de hoja y transición Procesando hoja', async () => {
    const workbench = currentWorkbench();
    const sourceDropzone = findDropzone('Cargar fuente local');
    const upload = deferredWorkbookFile();

    const loading = waitForProjection(workbench, (model) =>
      model.source.status === 'loading' && model.source.fileName === 'precios-crecientes.xlsx');
    selectFilesThroughInput(sourceDropzone, [upload.file]);
    const loadingProjection = await loading;
    expect(loadingProjection.text).toContain('precios-crecientes.xlsx');
    expect(liveText(sourceDropzone)).toMatch(/Cargando/iu);

    const waitingForSheet = waitForProjection(workbench, (model) =>
      model.source.sheetSelectionRequired === true
      && model.source.selectedSheetName === undefined
      && model.source.sheets?.length === 59);
    upload.release();
    const awaitingProjection = await waitingForSheet;
    expect(awaitingProjection.model.source.sheets).toHaveLength(59);
    expect(sheetSelectorContainer().hidden).toBe(false);
    expect(sheetSelect().value).toBe('');
    expect(awaitingProjection.text).toContain('Falta elegir hoja');
    expect(awaitingProjection.text).toContain('Seleccioná la hoja de datos para continuar');

    const processing = waitForProjection(workbench, (model) =>
      model.source.selectedSheetName === '01092026' && model.source.sheetProcessingState === 'processing');
    const completed = waitForProjection(workbench, (model) => sheetFinal(model, '01092026'));
    chooseSheet('01092026');

    const processingProjection = await processing;
    const completedProjection = await completed;
    expect(processingProjection.text).toContain('Procesando hoja');
    expect(processingProjection.model.source.selectedSheetSummary).toBeUndefined();
    expect(completedProjection.text).toContain('86 filas · 92 columnas · 22 grupos NORMAL · 21 grupos ÉMINENT');
  });

  it('limpia derivados de la hoja anterior antes de publicar la nueva', async () => {
    const workbench = currentWorkbench();
    const sourceDropzone = findDropzone('Cargar fuente local');
    const upload = deferredWorkbookFile();

    const waitingForSheet = waitForProjection(workbench, (model) => model.source.sheets?.length === 59);
    selectFilesThroughInput(sourceDropzone, [upload.file]);
    upload.release();
    await waitingForSheet;

    const firstReady = waitForProjection(workbench, (model) => sheetFinal(model, '01092026'));
    chooseSheet('01092026');
    await firstReady;

    const svg = await svgFixture('ROLL EXACTO.svg');
    const svgResult = await api.execute('svg.load', { files: svg });
    expect(svgResult.ok).toBe(true);
    const preflight = await api.execute('preflight.run');
    expect(preflight.ok).toBe(true);

    expect(containsScalar(workbench.model, 10000)).toBe(true);
    expect(containsScalar(workbench.model, 7500)).toBe(true);
    expect(getPath(workbench.model, 'preflight')).toBeDefined();

    const processing = waitForProjection(workbench, (model) =>
      model.source.selectedSheetName === '01072026' && model.source.sheetProcessingState === 'processing');
    const secondReady = waitForProjection(workbench, (model) => sheetFinal(model, '01072026'));
    chooseSheet('01072026');

    const during = await processing;
    expect(during.text).toContain('Procesando hoja');
    expect(during.text).not.toContain('86 filas · 92 columnas · 22 grupos NORMAL · 21 grupos ÉMINENT');
    expect(during.model.source.selectedSheetSummary).toBeUndefined();
    expect(getPath(during.model, 'preflight')).toBeUndefined();
    expect(containsScalar(during.model, 10000)).toBe(false);
    expect(containsScalar(during.model, 7500)).toBe(false);

    const files = getPath(during.model, 'files');
    if (Array.isArray(files)) {
      files.filter(isRecord).forEach((file) => {
        expect(file['prices']).toBeUndefined();
        expect(file['match']).toBeUndefined();
        expect(file['preflight']).toBeUndefined();
        expect(file['generation']).toBeUndefined();
        expect(file['trace']).toBeUndefined();
      });
    }

    const after = await secondReady;
    expect(after.text).toContain('85 filas · 96 columnas · 22 grupos NORMAL · 23 grupos ÉMINENT');
    expect(after.text).not.toContain('86 filas · 92 columnas · 22 grupos NORMAL · 21 grupos ÉMINENT');
    expect(after.model.source.selectedSheetSummary).toMatchObject({
      rowCount: MATRIX_SHEET_SPECS['01072026'].rowCount,
      columnCount: MATRIX_SHEET_SPECS['01072026'].columnCount,
      normalGroupCount: MATRIX_SHEET_SPECS['01072026'].normalGroupCount,
      eminentGroupCount: MATRIX_SHEET_SPECS['01072026'].eminentGroupCount,
    });
  });

  it('reset borra workbook, hojas, selección y resumen y vuelve al estado inicial', async () => {
    const workbench = currentWorkbench();
    const upload = deferredWorkbookFile();
    const waitingForSheet = waitForProjection(workbench, (model) => model.source.sheets?.length === 59);
    selectFilesThroughInput(findDropzone('Cargar fuente local'), [upload.file]);
    upload.release();
    await waitingForSheet;

    const selected = waitForProjection(workbench, (model) => sheetFinal(model, '01062026'));
    chooseSheet('01062026');
    await selected;
    expect(sheetSelectorContainer().hidden).toBe(false);

    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);

    expect(workbench.model.source.status).toBe('empty');
    expect(workbench.model.source.fileName).toBeUndefined();
    expect(workbench.model.source.sheets ?? []).toHaveLength(0);
    expect(workbench.model.source.selectedSheetName).toBeUndefined();
    expect(workbench.model.source.suggestedSheetName).toBeUndefined();
    expect(workbench.model.source.sheetSelectionRequired).toBeUndefined();
    expect(workbench.model.source.sheetProcessingState).toBeUndefined();
    expect(workbench.model.source.selectedSheetSummary).toBeUndefined();
    expect(sheetSelectorContainer().hidden).toBe(true);
    expect(visibleText()).not.toContain('precios-crecientes.xlsx');
    expect(liveText(findDropzone('Cargar fuente local'))).toMatch(/Sin archivos/iu);
  });
});
