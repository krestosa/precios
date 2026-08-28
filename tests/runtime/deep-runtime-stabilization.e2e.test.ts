// @vitest-environment jsdom
import { zlibSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAppRuntimeController } from '../../src/app/generic-controller';
import type { AppRuntimeController } from '../../src/app/types';
import { dispatchWorkbenchEvent } from '../../src/features/ui/events';
import { PriceWorkbench } from '../../src/features/ui/workbench/workbench';
import { createGrowingWorkbookBytes } from '../fixtures/workbook/growing-workbook.fixture';

const NO_PRICE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180"><rect width="360" height="180"/></svg>';

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

function deferredTextFile(content: string, name: string): { readonly file: File; release(): void } {
  const file = asFile(content, name, 'image/svg+xml');
  let resolveText: ((value: string) => void) | undefined;
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: () => new Promise<string>((resolve) => { resolveText = resolve; }),
  });
  return {
    file,
    release: () => {
      if (!resolveText) throw new Error('La lectura diferida del SVG todavía no comenzó.');
      resolveText(content);
    },
  };
}

function deferredBinaryFile(name: string, type: string): { readonly file: File; release(): void } {
  const file = new File([new Uint8Array([0, 1, 2, 3])], name, { type });
  let resolveBytes: ((value: ArrayBuffer) => void) | undefined;
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => new Promise<ArrayBuffer>((resolve) => { resolveBytes = resolve; }),
  });
  return {
    file,
    release: () => {
      if (!resolveBytes) throw new Error('La lectura diferida de la fuente todavía no comenzó.');
      resolveBytes(new Uint8Array([0, 1, 2, 3]).buffer);
    },
  };
}

function workbookFile(): File {
  return new File([createGrowingWorkbookBytes()], 'precios-crecientes.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  return concat(uint32(data.length), typeBytes, data, uint32(crc32(concat(typeBytes, data))));
}

function transparentPng(width: number, height: number): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  ihdr.set(uint32(width), 0);
  ihdr.set(uint32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = new Uint8Array((1 + width * 4) * height);
  return concat(signature, chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()));
}

describe('W27 deep runtime stabilization', () => {
  let workbench: PriceWorkbench;
  let controller: AppRuntimeController;
  let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    workbench = document.createElement('pw-price-workbench') as PriceWorkbench;
    document.body.append(workbench);
    controller = installAppRuntimeController(workbench);
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
  });

  afterEach(() => {
    controller.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalCreateObjectUrl === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
    else URL.createObjectURL = originalCreateObjectUrl;
    if (originalRevokeObjectUrl === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL');
    else URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('cancela limpiamente un svg.load pendiente cuando source.selectSheet lo supersede', async () => {
    dispatchWorkbenchEvent(workbench, 'pw:price-source-files', { files: [workbookFile()] });
    await controller.waitFor('source.load');
    expect(workbench.model.source.sheets?.some((sheet) => sheet.name === '01092026')).toBe(true);

    const pendingSvg = deferredTextFile(NO_PRICE_SVG, 'pendiente.svg');
    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [pendingSvg.file] });
    expect(workbench.model.svgLoadStatus).toBe('loading');
    expect(workbench.model.files.map((file) => file.fileName)).toEqual(['pendiente.svg']);

    dispatchWorkbenchEvent(workbench, 'pw:sheet-select', { sheetName: '01092026' });
    await controller.waitFor('source.selectSheet');

    expect(workbench.model.source.selectedSheetName).toBe('01092026');
    expect(workbench.model.source.sheetProcessingState === 'ready' || workbench.model.source.sheetProcessingState === 'warning').toBe(true);
    expect(workbench.model.svgLoadStatus).not.toBe('loading');
    expect(workbench.model.files.map((file) => file.fileName)).not.toContain('pendiente.svg');
    expect(workbench.model.progress).toBeUndefined();

    pendingSvg.release();
    await controller.waitFor('svg.load');
    expect(workbench.model.svgLoadStatus).not.toBe('loading');
    expect(workbench.model.files.map((file) => file.fileName)).not.toContain('pendiente.svg');
  });

  it('elimina una fuente pendiente si source.load supersede font.load', async () => {
    const pendingFont = deferredBinaryFile('pendiente.woff2', 'font/woff2');
    dispatchWorkbenchEvent(workbench, 'pw:font-files', { files: [pendingFont.file] });
    expect(workbench.model.fontLoadStatus).toBe('loading');
    expect(workbench.model.fonts.some((font) => font.processingState === 'processing')).toBe(true);

    dispatchWorkbenchEvent(workbench, 'pw:price-source-files', { files: [workbookFile()] });
    await controller.waitFor('source.load');

    expect(workbench.model.fontLoadStatus).not.toBe('loading');
    expect(workbench.model.fonts.some((font) => font.processingState === 'processing')).toBe(false);

    pendingFont.release();
    await controller.waitFor('font.load');
    expect(workbench.model.fonts.some((font) => font.processingState === 'processing')).toBe(false);
  });

  it('exporta en ZIP dos SVG distintos con el mismo basename sin colisionar nombres de PNG', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type) {
      if (type !== '2d') return null;
      return {
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fontKerning: 'normal',
        measureText: (text: string) => ({ width: Array.from(text).length * 12 }),
        drawImage: () => undefined,
      } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
      callback(new Blob([transparentPng(this.width, this.height)], { type: type ?? 'image/png' }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    URL.createObjectURL = (() => 'blob:w27-export') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 360,
      height: 180,
      close: () => undefined,
    }) as unknown as ImageBitmap);

    dispatchWorkbenchEvent(workbench, 'pw:svg-files', {
      files: [
        asFile(NO_PRICE_SVG, 'duplicado.svg', 'image/svg+xml'),
        asFile(NO_PRICE_SVG.replace('<rect ', '<circle cx="20" cy="20" r="10"/><rect '), 'duplicado.svg', 'image/svg+xml'),
      ],
    });
    await controller.waitFor('svg.load');
    expect(workbench.model.files).toHaveLength(2);
    expect(new Set(workbench.model.files.map((file) => file.id)).size).toBe(2);

    dispatchWorkbenchEvent(workbench, 'pw:preflight-request', { fileIds: workbench.model.files.map((file) => file.id) });
    await controller.waitFor('preflight.run');
    const exportable = workbench.model.files.filter((file) => file.exportable);
    expect(exportable).toHaveLength(2);

    dispatchWorkbenchEvent(workbench, 'pw:export-request', { kind: 'zip', fileIds: exportable.map((file) => file.id) });
    await controller.waitFor('export.request');

    const result = controller.snapshot().exportResult;
    expect(result?.status).toBe('generated');
    const pngNames = result?.artifactNames.filter((name) => name.endsWith('.png')) ?? [];
    expect(pngNames).toHaveLength(2);
    expect(new Set(pngNames).size).toBe(2);
  });
});