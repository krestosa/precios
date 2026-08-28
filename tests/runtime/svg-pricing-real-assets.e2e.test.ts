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

const MINIMAL_REAL_SHAPE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180">
  <image x="0" y="0" width="1" height="1" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nQAAAABJRU5ErkJggg==" />
  <text x="24" y="72" font-family="Arial" font-size="24"><tspan>$$$$</tspan></text>
  <text x="24" y="126" font-family="Arial" font-size="24"><tspan>@@@@</tspan></text>
</svg>`;

function csvRow(code: string, action: string, normal: number, eminent: number): string {
  return `,${code},${action},${normal},,,${code},${action},${eminent},`;
}

const PRICING_CSV = [
  ',,,LOCAL TEST,LOCAL TEST,,,LOCAL TEST,LOCAL TEST',
  ',,,SALON,DELI,,,SALON,DELI',
  csvRow('T001', 'Tres Tiempos', 10000, 7500),
  csvRow('D001', 'Story 1', 31001, 23001),
  csvRow('D007', 'Story 7', 31007, 23007),
  csvRow('F001', 'Feed 1', 32001, 24001),
  csvRow('F007', 'Feed 7', 32007, 24007),
  csvRow('M001', 'Mailing', 33000, 25000),
  csvRow('Q137', SYNTHETIC_ACTION, 21000, 15750),
].join('\n');

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

async function loadPricingSource(api: ControlApi): Promise<void> {
  await executeAndWaitForState(
    api,
    'source.load',
    { files: asFile(PRICING_CSV, 'w9-pricing.csv', 'text/csv') },
    (state) => getPath(state, 'source', 'status') === 'ready'
      && getPath(state, 'source', 'fileName') === 'w9-pricing.csv',
  );
}

describe('W9 runtime: SVG reales con matching/precios data-driven', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('resuelve los cinco filenames observados y una acción inédita sin usar el contenido SVG como identidad', async () => {
    await loadPricingSource(api);
    const names = [...REAL_FILENAMES, SYNTHETIC_FILENAME];
    const files = names.map((name) => asFile(MINIMAL_REAL_SHAPE_SVG, name, 'image/svg+xml'));

    await executeAndWaitForState(
      api,
      'svg.load',
      { files },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready'
        && getPath(state, 'counts', 'svgFiles') === names.length,
    );

    const model = workbenchModel();
    for (const name of REAL_FILENAMES) {
      const file = findRecordByStringField(model, 'fileName', name);
      expect(file, `${name} debe existir en el modelo productivo`).not.toBeNull();
      expect(getPath(file, 'match', 'status'), `${name} debe quedar matched`).toBe('matched');
      expect(getPath(file, 'match', 'selected', 'label')).toBe('Tres Tiempos');
      expect(containsScalar(file, 10000), `${name} debe resolver NORMAL`).toBe(true);
      expect(containsScalar(file, 7500), `${name} debe resolver ÉMINENT`).toBe(true);
    }

    const synthetic = findRecordByStringField(model, 'fileName', SYNTHETIC_FILENAME);
    expect(synthetic).not.toBeNull();
    expect(getPath(synthetic, 'match', 'status')).toBe('matched');
    expect(getPath(synthetic, 'match', 'selected', 'label')).toBe(SYNTHETIC_ACTION);
    expect(containsScalar(synthetic, 21000)).toBe(true);
    expect(containsScalar(synthetic, 15750)).toBe(true);
  });
});
