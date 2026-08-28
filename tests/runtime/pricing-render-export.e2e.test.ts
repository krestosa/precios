import { readFile } from 'node:fs/promises';
import { unzipSync, zlibSync } from 'fflate';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectPng } from '../../src/features/export';
import {
  bootControlRuntime,
  containsScalar,
  executeAndWaitForState,
  findRecordByStringField,
  getPath,
  workbenchModel,
  type ControlApi,
} from './control-api-testkit';

const SYNTHETIC_ACTION = 'Campaña Runtime Inédita';
const SYNTHETIC_FILENAME = `${SYNTHETIC_ACTION} Story 1.svg`;
const REAL_REGRESSION_ACTION = 'Tres Tiempos';
const REAL_REGRESSION_FILENAME = 'Tres Tiempos Story 1.svg';
const MISSING_ACTION = 'Acción Runtime Sin Precio';
const MISSING_FILENAME = `${MISSING_ACTION} Story 1.svg`;

const EDITABLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <text x="24" y="72" font-family="Arial" font-size="24"><tspan>$$$$</tspan></text>
  <text x="24" y="126" font-family="Arial" font-size="24"><tspan>@@@@</tspan></text>
</svg>`;

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

function clonePricingRow(
  template: string,
  code: string,
  action: string,
  normalSalon: string,
  normalDeli: string,
  eminentSalon: string,
  eminentDeli: string,
): string {
  return template
    .replaceAll('1001', code)
    .replaceAll('ROLL EXACTO', action)
    .replace('10000', normalSalon)
    .replace('11000', normalDeli)
    .replace('7500', eminentSalon)
    .replace('8250', eminentDeli);
}

async function pricingCsv(): Promise<string> {
  const base = await readFile(new URL('../fixtures/pricing/workflow-prices.csv', import.meta.url), 'utf8');
  const lines = base.trimEnd().split(/\r?\n/u);
  const template = lines.find((line) => line.includes('ROLL EXACTO'));
  if (template === undefined) throw new Error('La fixture base no contiene la fila ROLL EXACTO esperada.');
  return [
    ...lines.slice(0, 3),
    clonePricingRow(template, 'W1301', SYNTHETIC_ACTION, '10000', '10000', '7500', '7500'),
    clonePricingRow(template, 'W1302', REAL_REGRESSION_ACTION, '20000', '20000', '15000', '15000'),
    clonePricingRow(template, 'W1303', MISSING_ACTION, '12000', '', '', ''),
  ].join('\n');
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
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
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
  const rowSize = 1 + width * 4;
  const raw = new Uint8Array(rowSize * height);
  return concat(signature, chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array()));
}

function record(root: unknown, fileName: string): Record<string, unknown> {
  const found = findRecordByStringField(root, 'fileName', fileName);
  expect(found, `${fileName} debe existir en el modelo`).not.toBeNull();
  if (found === null) throw new Error(`${fileName} no existe en el modelo.`);
  return found;
}

describe('W13 pricing → SVG procesado → preview → PNG/export', () => {
  let api: ControlApi;
  let rasterizedSvg = '';
  let downloadedBlob: Blob | null = null;
  let originalCreateObjectUrl: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL | undefined;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    rasterizedSvg = '';
    downloadedBlob = null;

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

    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      rasterizedSvg = await blob.text();
      return { width: 360, height: 180, close: () => undefined } as unknown as ImageBitmap;
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
      callback(new Blob([transparentPng(this.width, this.height)], { type: type ?? 'image/png' }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      downloadedBlob = blob;
      return 'blob:w13-test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;

    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalCreateObjectUrl === undefined) Reflect.deleteProperty(URL, 'createObjectURL');
    else URL.createObjectURL = originalCreateObjectUrl;
    if (originalRevokeObjectUrl === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL');
    else URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('atraviesa controller/view-model/engine/preview/export con datos reales y bloquea el matched sin precios', async () => {
    const csv = await pricingCsv();
    await executeAndWaitForState(
      api,
      'source.load',
      { files: asFile(csv, 'w13-pricing.csv', 'text/csv') },
      (state) => getPath(state, 'source', 'status') === 'ready',
    );

    await executeAndWaitForState(
      api,
      'svg.load',
      {
        files: [
          asFile(EDITABLE_SVG, SYNTHETIC_FILENAME, 'image/svg+xml'),
          asFile(EDITABLE_SVG, REAL_REGRESSION_FILENAME, 'image/svg+xml'),
          asFile(EDITABLE_SVG, MISSING_FILENAME, 'image/svg+xml'),
        ],
      },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready'
        && getPath(state, 'counts', 'svgFiles') === 3,
    );

    let model = workbenchModel();
    const syntheticBefore = record(model, SYNTHETIC_FILENAME);
    expect(getPath(syntheticBefore, 'match', 'status')).toBe('matched');
    expect(getPath(syntheticBefore, 'match', 'selected', 'label')).toBe(SYNTHETIC_ACTION);
    expect(getPath(syntheticBefore, 'prices', 'normal', 'amount')).toBe(10000);
    expect(getPath(syntheticBefore, 'prices', 'eminent', 'amount')).toBe(7500);
    expect(getPath(syntheticBefore, 'exportable')).toBe(false);

    const missingBefore = record(model, MISSING_FILENAME);
    expect(getPath(missingBefore, 'match', 'status')).toBe('matched');
    expect(getPath(missingBefore, 'match', 'selected', 'label')).toBe(MISSING_ACTION);
    expect(containsScalar(missingBefore, 'pricing.explicit-pair-missing')).toBe(false);
    expect(getPath(missingBefore, 'exportable')).toBe(false);

    await executeAndWaitForState(
      api,
      'preflight.run',
      undefined,
      (state) => getPath(state, 'preflight', 'fileCount') === 3,
    );

    model = workbenchModel();
    const synthetic = record(model, SYNTHETIC_FILENAME);
    const processedSvg = getPath(synthetic, 'generation', 'svg');
    expect(getPath(synthetic, 'generation', 'status')).toBe('generated');
    expect(typeof processedSvg).toBe('string');
    if (typeof processedSvg !== 'string') throw new Error('El SVG procesado no quedó expuesto por el view-model productivo.');
    expect(processedSvg).not.toContain('$$$$');
    expect(processedSvg).not.toContain('@@@@');
    expect(processedSvg).toContain('10000');
    expect(processedSvg).toContain('7500');
    expect(getPath(synthetic, 'preview', 'result', 'value')).toBe(processedSvg);
    expect(String(getPath(synthetic, 'preview', 'overlay', 'value'))).toContain(processedSvg);
    expect(getPath(synthetic, 'exportable')).toBe(true);
    expect(getPath(synthetic, 'preflight', 'blocking')).toBe(false);

    const realRegression = record(model, REAL_REGRESSION_FILENAME);
    expect(getPath(realRegression, 'match', 'status')).toBe('matched');
    expect(getPath(realRegression, 'match', 'selected', 'label')).toBe(REAL_REGRESSION_ACTION);
    expect(getPath(realRegression, 'generation', 'status')).toBe('generated');
    expect(String(getPath(realRegression, 'generation', 'svg'))).not.toContain('$$$$');
    expect(String(getPath(realRegression, 'generation', 'svg'))).not.toContain('@@@@');
    expect(getPath(realRegression, 'exportable')).toBe(true);

    const missing = record(model, MISSING_FILENAME);
    expect(getPath(missing, 'match', 'status')).toBe('matched');
    expect(getPath(missing, 'preflight', 'blocking')).toBe(true);
    expect(getPath(missing, 'generation')).toBeUndefined();
    expect(getPath(missing, 'preview', 'result')).toBeUndefined();
    expect(getPath(missing, 'exportable')).toBe(false);
    expect(getPath(missing, 'processingState')).not.toBe('ready');
    expect(containsScalar(getPath(missing, 'preflight'), 'pricing.explicit-pair-missing')).toBe(true);
    expect(containsScalar(getPath(missing, 'preflight'), 'svg.transformation.result-missing')).toBe(true);

    const fileId = getPath(synthetic, 'id');
    expect(typeof fileId).toBe('string');
    if (typeof fileId !== 'string') throw new Error('No hay fileId para export individual.');

    downloadedBlob = null;
    rasterizedSvg = '';
    const individual = await api.execute('export.request', { kind: 'file', fileIds: [fileId] });
    expect(individual.ok).toBe(true);
    expect(rasterizedSvg).toBe(processedSvg);
    expect(rasterizedSvg).not.toContain('$$$$');
    expect(rasterizedSvg).not.toContain('@@@@');
    expect(rasterizedSvg).toContain('10000');
    expect(rasterizedSvg).toContain('7500');
    expect(downloadedBlob).not.toBeNull();
    expect(downloadedBlob?.type).toBe('image/png');
    const individualBytes = new Uint8Array(await downloadedBlob!.arrayBuffer());
    const individualInspection = inspectPng(individualBytes);
    expect(individualInspection).toEqual({ valid: true, mimeType: 'image/png', width: 360, height: 180 });
    expect(getPath(api.getState(), 'runtime', 'exportResult', 'status')).toBe('generated');
    expect(containsScalar(getPath(api.getState(), 'runtime', 'exportResult', 'artifactNames'), `${SYNTHETIC_ACTION} Story 1.png`)).toBe(true);

    downloadedBlob = null;
    const regressionId = getPath(realRegression, 'id');
    expect(typeof regressionId).toBe('string');
    if (typeof regressionId !== 'string') throw new Error('No hay fileId para la regresión real.');
    const batch = await api.execute('export.request', { kind: 'batch', fileIds: [fileId, regressionId] });
    expect(batch.ok).toBe(true);
    expect(downloadedBlob?.type).toBe('application/zip');
    const zipEntries = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    const pngNames = Object.keys(zipEntries).filter((name) => name.endsWith('.png'));
    expect(pngNames).toEqual(expect.arrayContaining([
      `${SYNTHETIC_ACTION} Story 1.png`,
      'Tres Tiempos Story 1.png',
    ]));
    for (const name of pngNames) expect(inspectPng(zipEntries[name]!).valid, name).toBe(true);

    downloadedBlob = null;
    const missingId = getPath(missing, 'id');
    expect(typeof missingId).toBe('string');
    if (typeof missingId !== 'string') throw new Error('No hay fileId para el caso bloqueado.');
    const blocked = await api.execute('export.request', { kind: 'file', fileIds: [missingId] });
    expect(blocked.ok).toBe(false);
    expect(downloadedBlob).toBeNull();
  });
});
