import { unzipSync, zlibSync } from 'fflate';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootControlRuntime,
  containsScalar,
  executeAndWaitForState,
  getPath,
  isRecord,
  workbenchModel,
  type ControlApi,
} from './control-api-testkit';

const EDITABLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <text x="24" y="72" font-family="Arial" font-size="24"><tspan>$$$$</tspan></text>
  <text x="24" y="126" font-family="Arial" font-size="24"><tspan>@@@@</tspan></text>
</svg>`;

interface GroupPrices {
  readonly group: string;
  readonly normal: number;
  readonly eminent: number | null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pricingCsv(action: string, groups: readonly GroupPrices[]): string {
  const groupRow: Array<string | number> = ['', '', ''];
  const channelRow: Array<string | number> = ['', '', ''];
  const dataRow: Array<string | number> = ['', 'W1501', action];

  groups.forEach((entry) => {
    groupRow.push(entry.group, entry.group);
    channelRow.push('SALON', 'DELI');
    dataRow.push(entry.normal, entry.normal);
  });

  groupRow.push('', '');
  channelRow.push('', '');
  dataRow.push('W1501', action);

  groups.forEach((entry) => {
    groupRow.push(entry.group, entry.group);
    channelRow.push('SALON', 'DELI');
    dataRow.push(entry.eminent ?? '', entry.eminent ?? '');
  });

  return [groupRow, channelRow, dataRow]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

function modelFiles(): Record<string, unknown>[] {
  const model = workbenchModel();
  if (!isRecord(model) || !Array.isArray(model.files)) return [];
  return model.files.filter(isRecord);
}

function sourceViews(sourceArtworkFileName: string): Record<string, unknown>[] {
  return modelFiles().filter((entry) => entry.sourceArtworkFileName === sourceArtworkFileName);
}

function sourceViewForGroup(sourceArtworkFileName: string, group: string): Record<string, unknown> {
  const found = sourceViews(sourceArtworkFileName).find((entry) => entry.rawGroup === group);
  expect(found, `${sourceArtworkFileName} debe producir target ${group}`).toBeDefined();
  if (found === undefined) throw new Error(`Falta target ${group} para ${sourceArtworkFileName}.`);
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

describe('W15 modelo de gráfica genérica / locales data-driven', () => {
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
      return 'blob:w15-test';
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

  it('A) action-only genérico deriva GENERAL/PALERMO/RECOVA, procesa cada precio y exporta PNG desde resultSvg', async () => {
    const action = 'Campaña General Inédita';
    const filename = `${action} Story 1.svg`;
    const groups = [
      { group: 'GENERAL', normal: 10100, eminent: 7575 },
      { group: 'PALERMO', normal: 20200, eminent: 15150 },
      { group: 'RECOVA', normal: 30300, eminent: 22725 },
    ] as const;

    await executeAndWaitForState(
      api,
      'source.load',
      { files: asFile(pricingCsv(action, groups), 'w15-a.csv', 'text/csv') },
      (state) => getPath(state, 'source', 'status') === 'ready',
    );
    await executeAndWaitForState(
      api,
      'svg.load',
      { files: asFile(EDITABLE_SVG, filename, 'image/svg+xml') },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready',
    );

    const before = sourceViews(filename);
    expect(before).toHaveLength(3);
    for (const view of before) {
      expect(view.sourceScope).toBe('generic');
      expect(view.sourceLocal).toBeNull();
      expect(getPath(view, 'match', 'status')).toBe('matched');
      expect(getPath(view, 'match', 'selected', 'label')).toBe(action);
    }

    await executeAndWaitForState(
      api,
      'preflight.run',
      undefined,
      (state) => getPath(state, 'preflight', 'fileCount') === 3,
    );

    for (const expected of groups) {
      const view = sourceViewForGroup(filename, expected.group);
      expect(getPath(view, 'prices', 'normal', 'amount')).toBe(expected.normal);
      expect(getPath(view, 'prices', 'eminent', 'amount')).toBe(expected.eminent);
      expect(getPath(view, 'generation', 'status')).toBe('generated');
      const resultSvg = getPath(view, 'generation', 'svg');
      expect(typeof resultSvg).toBe('string');
      expect(String(resultSvg)).toContain(String(expected.normal));
      expect(String(resultSvg)).toContain(String(expected.eminent));
      expect(String(resultSvg)).not.toContain('$$$$');
      expect(String(resultSvg)).not.toContain('@@@@');
      expect(getPath(view, 'preview', 'result', 'value')).toBe(resultSvg);
      expect(String(getPath(view, 'preview', 'overlay', 'value'))).toContain(String(resultSvg));
      expect(view.exportable).toBe(true);
    }

    const general = sourceViewForGroup(filename, 'GENERAL');
    const generalId = general.id;
    expect(typeof generalId).toBe('string');
    if (typeof generalId !== 'string') throw new Error('Falta id de output GENERAL.');
    const generalSvg = String(getPath(general, 'generation', 'svg'));
    rasterizedSvg = '';
    downloadedBlob = null;
    const exported = await api.execute('export.request', { kind: 'file', fileIds: [generalId] });
    expect(exported.ok).toBe(true);
    expect(rasterizedSvg).toBe(generalSvg);
    expect(downloadedBlob?.type).toBe('image/png');
  });

  it('B) un source Palermo local-specific reemplaza sólo PALERMO y el genérico conserva GENERAL+RECOVA sin duplicados', async () => {
    const action = 'Campaña General Inédita';
    const generic = `${action} Story 1.svg`;
    const specific = `Palermo ${action} Story 1.svg`;
    const groups = [
      { group: 'GENERAL', normal: 11000, eminent: 8250 },
      { group: 'PALERMO', normal: 22000, eminent: 16500 },
      { group: 'RECOVA', normal: 33000, eminent: 24750 },
    ] as const;

    await executeAndWaitForState(api, 'source.load', { files: asFile(pricingCsv(action, groups), 'w15-b.csv', 'text/csv') }, (state) => getPath(state, 'source', 'status') === 'ready');
    await executeAndWaitForState(api, 'svg.load', { files: [asFile(EDITABLE_SVG, generic, 'image/svg+xml'), asFile(EDITABLE_SVG, specific, 'image/svg+xml')] }, (state) => getPath(state, 'loads', 'svgStatus') === 'ready');

    expect(modelFiles()).toHaveLength(3);
    expect(sourceViews(generic).map((entry) => entry.rawGroup).sort()).toEqual(['GENERAL', 'RECOVA']);
    const specificViews = sourceViews(specific);
    expect(specificViews).toHaveLength(1);
    expect(specificViews[0]!.rawGroup).toBe('PALERMO');
    expect(specificViews[0]!.sourceScope).toBe('local-specific');
    expect(specificViews[0]!.sourceLocal).toBe('PALERMO');
    const genericGeneral = sourceViewForGroup(generic, 'GENERAL');
    const derived = genericGeneral.derivedTargets;
    expect(Array.isArray(derived)).toBe(true);
    expect(containsScalar(derived, 'PALERMO')).toBe(true);
    expect(containsScalar(derived, true)).toBe(true);
  });

  it('C) Palermo dentro del nombre real de action no se recorta; Recova prefijado sí puede ser local-specific por evidencia', async () => {
    const action = 'Especial Palermo Nocturno';
    const generic = `${action} Feed 2.svg`;
    const specific = `Recova ${action} Feed 2.svg`;
    const groups = [
      { group: 'PALERMO', normal: 14000, eminent: 10500 },
      { group: 'RECOVA', normal: 18000, eminent: 13500 },
    ] as const;

    await executeAndWaitForState(api, 'source.load', { files: asFile(pricingCsv(action, groups), 'w15-c.csv', 'text/csv') }, (state) => getPath(state, 'source', 'status') === 'ready');
    await executeAndWaitForState(api, 'svg.load', { files: [asFile(EDITABLE_SVG, generic, 'image/svg+xml'), asFile(EDITABLE_SVG, specific, 'image/svg+xml')] }, (state) => getPath(state, 'loads', 'svgStatus') === 'ready');

    const genericView = sourceViewForGroup(generic, 'PALERMO');
    expect(genericView.sourceScope).toBe('generic');
    expect(genericView.sourceLocal).toBeNull();
    expect(getPath(genericView, 'match', 'selected', 'label')).toBe(action);
    const specificView = sourceViewForGroup(specific, 'RECOVA');
    expect(specificView.sourceScope).toBe('local-specific');
    expect(specificView.sourceLocal).toBe('RECOVA');
    expect(getPath(specificView, 'match', 'selected', 'label')).toBe(action);
  });

  it('D) un target sin ÉMINENT bloquea sólo ese output; dos outputs sanos siguen procesables y el ZIP queda parcial', async () => {
    const action = 'Campaña General Inédita';
    const filename = `${action} Story 1.svg`;
    const groups = [
      { group: 'GENERAL', normal: 11500, eminent: 8625 },
      { group: 'PALERMO', normal: 22500, eminent: 16875 },
      { group: 'RECOVA', normal: 33500, eminent: null },
    ] as const;

    await executeAndWaitForState(api, 'source.load', { files: asFile(pricingCsv(action, groups), 'w15-d.csv', 'text/csv') }, (state) => getPath(state, 'source', 'status') === 'ready');
    await executeAndWaitForState(api, 'svg.load', { files: asFile(EDITABLE_SVG, filename, 'image/svg+xml') }, (state) => getPath(state, 'loads', 'svgStatus') === 'ready');
    await executeAndWaitForState(api, 'preflight.run', undefined, (state) => getPath(state, 'preflight', 'fileCount') === 3);

    const views = sourceViews(filename);
    expect(views).toHaveLength(3);
    const healthy = views.filter((entry) => entry.exportable === true);
    const blocked = views.filter((entry) => entry.exportable !== true);
    expect(healthy).toHaveLength(2);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]!.rawGroup).toBe('RECOVA');
    expect(getPath(blocked[0], 'preflight', 'blocking')).toBe(true);
    expect(containsScalar(getPath(blocked[0], 'preflight'), 'pricing.explicit-pair-missing')).toBe(true);
    expect(getPath(blocked[0], 'generation')).toBeUndefined();
    healthy.forEach((entry) => expect(getPath(entry, 'generation', 'status')).toBe('generated'));

    const ids = views.map((entry) => entry.id).filter((id): id is string => typeof id === 'string');
    downloadedBlob = null;
    const exported = await api.execute('export.request', { kind: 'batch', fileIds: ids });
    expect(exported.ok).toBe(true);
    expect(downloadedBlob?.type).toBe('application/zip');
    const zipEntries = unzipSync(new Uint8Array(await downloadedBlob!.arrayBuffer()));
    expect(Object.keys(zipEntries).filter((name) => name.endsWith('.png'))).toHaveLength(2);
    expect(getPath(api.getState(), 'runtime', 'exportResult', 'partial')).toBe(true);
  });

  it('E) LOCAL FUTURO 2030 aparece como target al agregarlo sólo en la fixture runtime', async () => {
    const action = 'Campaña General Inédita';
    const filename = `${action} Story 1.svg`;
    const groups = [
      { group: 'GENERAL', normal: 10000, eminent: 7500 },
      { group: 'LOCAL FUTURO 2030', normal: 44400, eminent: 33300 },
    ] as const;

    await executeAndWaitForState(api, 'source.load', { files: asFile(pricingCsv(action, groups), 'w15-e.csv', 'text/csv') }, (state) => getPath(state, 'source', 'status') === 'ready');
    await executeAndWaitForState(api, 'svg.load', { files: asFile(EDITABLE_SVG, filename, 'image/svg+xml') }, (state) => getPath(state, 'loads', 'svgStatus') === 'ready');

    const future = sourceViewForGroup(filename, 'LOCAL FUTURO 2030');
    expect(future.sourceScope).toBe('generic');
    expect(getPath(future, 'prices', 'normal', 'amount')).toBe(44400);
    expect(getPath(future, 'prices', 'eminent', 'amount')).toBe(33300);
  });

  it('F) Tres Tiempos Story 1 sigue siendo action-only genérico: sourceLocal=null y no existe fallo por local desconocido', async () => {
    const action = 'Tres Tiempos';
    const filename = 'Tres Tiempos Story 1.svg';
    const groups = [{ group: 'GENERAL', normal: 20000, eminent: 15000 }] as const;

    await executeAndWaitForState(api, 'source.load', { files: asFile(pricingCsv(action, groups), 'w15-f.csv', 'text/csv') }, (state) => getPath(state, 'source', 'status') === 'ready');
    await executeAndWaitForState(api, 'svg.load', { files: asFile(EDITABLE_SVG, filename, 'image/svg+xml') }, (state) => getPath(state, 'loads', 'svgStatus') === 'ready');
    await executeAndWaitForState(api, 'preflight.run', undefined, (state) => getPath(state, 'preflight', 'fileCount') === 1);

    const view = sourceViewForGroup(filename, 'GENERAL');
    expect(view.sourceScope).toBe('generic');
    expect(view.sourceLocal).toBeNull();
    expect(view.detectedLocal).toBeUndefined();
    expect(getPath(view, 'trace', 'local', 'raw')).toBeUndefined();
    expect(getPath(view, 'match', 'status')).toBe('matched');
    expect(getPath(view, 'match', 'selected', 'label')).toBe(action);
    expect(containsScalar(view, 'local desconocido')).toBe(false);
    expect(view.exportable).toBe(true);
  });
});
