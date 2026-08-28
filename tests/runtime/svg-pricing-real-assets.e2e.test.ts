import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootControlRuntime,
  containsScalar,
  executeAndWaitForState,
  findRecordByStringField,
  getPath,
  workbenchModel,
  type ControlApi,
} from './control-api-testkit';

const REAL_FILENAMES = [
  'Tres Tiempos Story 1.svg',
  'Tres Tiempos Story 7.svg',
  'Tres Tiempos Feed 1.svg',
  'Tres Tiempos Feed 7.svg',
  'Tres Tiempos Mailing.svg',
] as const;

const SYNTHETIC_ACTION = 'Órbita Quásar 8137';
const SYNTHETIC_FILENAME = `${SYNTHETIC_ACTION} Story 1.svg`;
const FORMAT_LOCAL_TOKEN_ACTION = 'LOCAL TEST Story Aurora 9201';
const FORMAT_LOCAL_TOKEN_FILENAME = `${FORMAT_LOCAL_TOKEN_ACTION} Feed 12.svg`;
const LOCAL_PREFIX_ACTION = 'Órbita Prisma 9202';
const LOCAL_PREFIX_FILENAME = `LOCAL TEST ${LOCAL_PREFIX_ACTION} Mailing.svg`;

const MINIMAL_REAL_SHAPE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <image x="0" y="0" width="1" height="1" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==" />
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
  normal: number,
  eminent: number,
): string {
  return template
    .replaceAll('1001', code)
    .replaceAll('ROLL EXACTO', action)
    .replace('10000', String(normal))
    .replace('11000', '')
    .replace('7500', String(eminent))
    .replace('8250', '');
}

async function pricingCsv(): Promise<string> {
  const base = await readFile(new URL('../fixtures/pricing/workflow-prices.csv', import.meta.url), 'utf8');
  const lines = base.trimEnd().split(/\r?\n/u);
  const template = lines.find((line) => line.includes('ROLL EXACTO'));
  if (template === undefined) throw new Error('La fixture base no contiene la fila ROLL EXACTO esperada.');

  return [
    ...lines.slice(0, 3),
    clonePricingRow(template, 'T001', 'Tres Tiempos', 10000, 7500),
    clonePricingRow(template, 'D001', 'Story 1', 31001, 23001),
    clonePricingRow(template, 'D007', 'Story 7', 31007, 23007),
    clonePricingRow(template, 'F001', 'Feed 1', 32001, 24001),
    clonePricingRow(template, 'F007', 'Feed 7', 32007, 24007),
    clonePricingRow(template, 'M001', 'Mailing', 33000, 25000),
    clonePricingRow(template, 'Q137', SYNTHETIC_ACTION, 21000, 15750),
    clonePricingRow(template, 'A201', FORMAT_LOCAL_TOKEN_ACTION, 22000, 16500),
    clonePricingRow(template, 'P202', LOCAL_PREFIX_ACTION, 23000, 17250),
  ].join('\n');
}

async function loadPricingSource(api: ControlApi): Promise<void> {
  const csv = await pricingCsv();
  await executeAndWaitForState(
    api,
    'source.load',
    { files: asFile(csv, 'w11-pricing.csv', 'text/csv') },
    (state) => getPath(state, 'source', 'status') === 'ready'
      && getPath(state, 'source', 'fileName') === 'w11-pricing.csv',
  );
}

function expectActionOnlyProvenance(file: Record<string, unknown>, fileName: string): void {
  expect(getPath(file, 'trace', 'local', 'raw'), `${fileName} no debe inventar Local raw`).toBeUndefined();
  expect(getPath(file, 'trace', 'local', 'canonical'), `${fileName} no debe inventar Local canónico`).toBeUndefined();
}

describe('W11 runtime: matching/precios/provenance data-driven', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('resuelve los cinco SVG observados, precios y provenance action-only por el camino productivo', async () => {
    await loadPricingSource(api);
    const names = [
      ...REAL_FILENAMES,
      SYNTHETIC_FILENAME,
      FORMAT_LOCAL_TOKEN_FILENAME,
      LOCAL_PREFIX_FILENAME,
    ];
    const files = names.map((name) => asFile(MINIMAL_REAL_SHAPE_SVG, name, 'image/svg+xml'));

    await executeAndWaitForState(
      api,
      'svg.load',
      { files },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready'
        && getPath(state, 'counts', 'svgFiles') === names.length,
    );

    let model = workbenchModel();
    for (const name of REAL_FILENAMES) {
      const file = findRecordByStringField(model, 'fileName', name);
      expect(file, `${name} debe existir en el modelo productivo`).not.toBeNull();
      if (file === null) continue;
      expect(getPath(file, 'match', 'status'), `${name} debe quedar matched`).toBe('matched');
      expect(getPath(file, 'match', 'selected', 'label')).toBe('Tres Tiempos');
      expect(containsScalar(file, 10000), `${name} debe resolver NORMAL`).toBe(true);
      expect(containsScalar(file, 7500), `${name} debe resolver ÉMINENT`).toBe(true);
      expectActionOnlyProvenance(file, name);
    }

    const synthetic = findRecordByStringField(model, 'fileName', SYNTHETIC_FILENAME);
    expect(synthetic).not.toBeNull();
    expect(getPath(synthetic, 'match', 'status')).toBe('matched');
    expect(getPath(synthetic, 'match', 'selected', 'label')).toBe(SYNTHETIC_ACTION);
    expect(containsScalar(synthetic, 21000)).toBe(true);
    expect(containsScalar(synthetic, 15750)).toBe(true);

    const confusing = findRecordByStringField(model, 'fileName', FORMAT_LOCAL_TOKEN_FILENAME);
    expect(confusing).not.toBeNull();
    expect(getPath(confusing, 'match', 'status')).toBe('matched');
    expect(getPath(confusing, 'match', 'selected', 'label')).toBe(FORMAT_LOCAL_TOKEN_ACTION);
    expect(containsScalar(confusing, 22000)).toBe(true);
    expect(containsScalar(confusing, 16500)).toBe(true);
    if (confusing !== null) expectActionOnlyProvenance(confusing, FORMAT_LOCAL_TOKEN_FILENAME);

    const localPrefix = findRecordByStringField(model, 'fileName', LOCAL_PREFIX_FILENAME);
    expect(localPrefix).not.toBeNull();
    expect(getPath(localPrefix, 'match', 'status')).toBe('matched');
    expect(getPath(localPrefix, 'match', 'selected', 'label')).toBe(LOCAL_PREFIX_ACTION);
    expect(containsScalar(localPrefix, 23000)).toBe(true);
    expect(containsScalar(localPrefix, 17250)).toBe(true);
    expect(getPath(localPrefix, 'trace', 'local', 'raw')).toBe('LOCAL TEST');
    expect(getPath(localPrefix, 'trace', 'local', 'canonical')).toBe('local test');

    await executeAndWaitForState(
      api,
      'preflight.run',
      undefined,
      (state) => getPath(state, 'preflight', 'fileCount') === names.length,
    );

    model = workbenchModel();
    for (const name of REAL_FILENAMES) {
      const file = findRecordByStringField(model, 'fileName', name);
      expect(file).not.toBeNull();
      expect(containsScalar(file, 'matching.unmatched'), `${name} no debe producir matching.unmatched`).toBe(false);
      expect(containsScalar(file, 'pricing.record-not-found'), `${name} debe conservar la fila de precios resuelta`).toBe(false);
      expect(containsScalar(file, 'pricing.explicit-pair-missing'), `${name} debe conservar NORMAL/ÉMINENT`).toBe(false);
    }
  });
});
