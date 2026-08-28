// @vitest-environment jsdom
import { zlibSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAppRuntimeController } from '../../src/app/generic-controller';
import type { AppRuntimeController } from '../../src/app/types';
import { dispatchWorkbenchEvent } from '../../src/features/ui/events';
import type { WorkbenchFileView } from '../../src/features/ui/models';
import { PriceWorkbench } from '../../src/features/ui/workbench/workbench';

const EDITABLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <text x="24" y="72" font-family="Arial" font-size="24"><tspan>$$$$</tspan></text>
  <text x="24" y="126" font-family="Arial" font-size="24"><tspan>@@@@</tspan></text>
</svg>`;

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

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pricingCsv(action: string, groups: readonly string[]): string {
  const groupRow: Array<string | number> = ['', '', ''];
  const channelRow: Array<string | number> = ['', '', ''];
  const dataRow: Array<string | number> = ['', 'W2601', action];

  groups.forEach((group, index) => {
    groupRow.push(group, group);
    channelRow.push('SALON', 'DELI');
    const normal = 10000 + index * 1000;
    dataRow.push(normal, normal);
  });

  groupRow.push('', '');
  channelRow.push('', '');
  dataRow.push('W2601', action);

  groups.forEach((group, index) => {
    groupRow.push(group, group);
    channelRow.push('SALON', 'DELI');
    const eminent = 7500 + index * 750;
    dataRow.push(eminent, eminent);
  });

  return [groupRow, channelRow, dataRow]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

function viewForGroup(workbench: PriceWorkbench, group: string): WorkbenchFileView {
  const found = workbench.model.files.find((file) => file.rawGroup === group);
  expect(found, `Debe existir el output ${group}`).toBeDefined();
  if (!found) throw new Error(`Falta output ${group}.`);
  return found;
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

describe('W26 post center-canvas stabilization', () => {
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

  it('descarta un preflight viejo si el set de SVG se reemplaza mientras generation está pendiente', async () => {
    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [asFile(NO_PRICE_SVG, 'old.svg', 'image/svg+xml')] });
    await controller.waitFor('svg.load');
    expect(workbench.model.files.map((file) => file.fileName)).toEqual(['old.svg']);

    const replacement = deferredTextFile(NO_PRICE_SVG, 'new.svg');
    dispatchWorkbenchEvent(workbench, 'pw:preflight-request', { fileIds: workbench.model.files.map((file) => file.id) });
    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [replacement.file] });
    await controller.waitFor('preflight.run');

    expect(workbench.model.preflight).toBeUndefined();
    replacement.release();
    await controller.waitFor('svg.load');
    expect(workbench.model.files.map((file) => file.fileName)).toEqual(['new.svg']);
    expect(workbench.model.preflight).toBeUndefined();
  });

  it('no entrega ni publica un export viejo si cambia el set de SVG durante la rasterización', async () => {
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
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    URL.createObjectURL = (() => 'blob:w26-stale-export') as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

    let markRasterStarted: (() => void) | undefined;
    const rasterStarted = new Promise<void>((resolve) => { markRasterStarted = resolve; });
    let releaseRaster: (() => void) | undefined;
    const rasterGate = new Promise<void>((resolve) => { releaseRaster = resolve; });
    vi.stubGlobal('createImageBitmap', async () => {
      markRasterStarted?.();
      await rasterGate;
      return { width: 360, height: 180, close: () => undefined } as unknown as ImageBitmap;
    });

    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [asFile(NO_PRICE_SVG, 'export-old.svg', 'image/svg+xml')] });
    await controller.waitFor('svg.load');
    dispatchWorkbenchEvent(workbench, 'pw:preflight-request', { fileIds: workbench.model.files.map((file) => file.id) });
    await controller.waitFor('preflight.run');
    const oldId = workbench.model.files[0]?.id;
    expect(oldId).toBeTruthy();
    if (!oldId) throw new Error('Falta output exportable para la carrera de export.');

    dispatchWorkbenchEvent(workbench, 'pw:export-request', { kind: 'file', fileIds: [oldId] });
    await rasterStarted;
    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [asFile(NO_PRICE_SVG, 'export-new.svg', 'image/svg+xml')] });
    await controller.waitFor('svg.load');
    releaseRaster?.();
    await controller.waitFor('export.request');

    expect(click).not.toHaveBeenCalled();
    expect(controller.snapshot().exportResult).toBeNull();
    expect(workbench.model.files.map((file) => file.fileName)).toEqual(['export-new.svg']);
  });

  it('mantiene la identidad y selección semántica de targets aunque la matriz cambie su orden', async () => {
    const action = 'Acción Sintética de Orden';
    const fileName = `${action} Story 1.svg`;
    dispatchWorkbenchEvent(workbench, 'pw:price-source-files', {
      files: [asFile(pricingCsv(action, ['ALPHA', 'BETA']), 'order-a.csv', 'text/csv')],
    });
    await controller.waitFor('source.load');
    dispatchWorkbenchEvent(workbench, 'pw:svg-files', { files: [asFile(EDITABLE_SVG, fileName, 'image/svg+xml')] });
    await controller.waitFor('svg.load');

    const alphaBefore = viewForGroup(workbench, 'ALPHA');
    const betaBefore = viewForGroup(workbench, 'BETA');
    expect(alphaBefore.id).not.toBe(betaBefore.id);
    workbench.dispatchEvent(new CustomEvent('ui:file-activate', { detail: { id: alphaBefore.id }, bubbles: true, composed: true }));
    expect(workbench.uiState.selectedFileId).toBe(alphaBefore.id);

    dispatchWorkbenchEvent(workbench, 'pw:price-source-files', {
      files: [asFile(pricingCsv(action, ['BETA', 'ALPHA']), 'order-b.csv', 'text/csv')],
    });
    await controller.waitFor('source.load');

    const alphaAfter = viewForGroup(workbench, 'ALPHA');
    const betaAfter = viewForGroup(workbench, 'BETA');
    expect(alphaAfter.id).toBe(alphaBefore.id);
    expect(betaAfter.id).toBe(betaBefore.id);
    expect(workbench.model.files.find((file) => file.id === workbench.uiState.selectedFileId)?.rawGroup).toBe('ALPHA');
  });
});
