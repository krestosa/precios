import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { adaptCsvPricingCompatibility } from '../../src/app/csv-pricing-compat';
import { reconcilePriceSlots } from '../../src/domain/pricing/reconcile';
import { loadLocalWorkbook } from '../../src/features/data-source/local-workbook-source';
import { matchName } from '../../src/features/matching/name-matcher';
import { analyzeSvg } from '../../src/features/svg-engine/analyze';

async function fixture(path: string): Promise<string> {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

describe('fixtures productivos mínimos', () => {
  let csv: string;

  beforeAll(async () => {
    csv = await fixture('pricing/workflow-prices.csv');
  });

  it('parsea el CSV local y conserva NORMAL/ÉMINENT explícitos', () => {
    const bytes = new TextEncoder().encode(csv);
    const loaded = loadLocalWorkbook({ sourceId: 'qa-local', fileName: 'workflow-prices.csv', data: bytes });
    expect(loaded.snapshots).toHaveLength(1);

    const adapted = adaptCsvPricingCompatibility(loaded.snapshots[0]!);
    expect(adapted.supported).toBe(true);
    const productRows = adapted.rows.filter((row) => row.kind === 'product');
    expect(productRows).toHaveLength(4);

    const exact = productRows.find((row) => row.product?.nameRaw === 'ROLL EXACTO');
    expect(exact).toBeDefined();
    const normal = exact?.slots.find((slot) => slot.tier === 'NORMAL' && slot.channel === 'SALON' && slot.groupRaw === 'LOCAL TEST');
    const eminent = exact?.slots.find((slot) => slot.tier === 'EMINENT' && slot.channel === 'SALON' && slot.groupRaw === 'LOCAL TEST');
    expect(normal?.field).toMatchObject({ state: 'known', amount: 10000 });
    expect(eminent?.field).toMatchObject({ state: 'known', amount: 7500 });

    const reconciled = reconcilePriceSlots(exact?.slots ?? []);
    const record = reconciled.records.find((entry) => entry.record.channel === 'SALON');
    expect(record?.record.prices.normal).toMatchObject({ state: 'known', amount: 10000 });
    expect(record?.record.prices.eminent).toMatchObject({ state: 'known', amount: 7500 });
  });

  it('produce matching exacto y preserva la ambigüedad para decisión humana', () => {
    const targets = [
      { id: '1001', label: 'ROLL EXACTO' },
      { id: '1002', label: 'ROLL AMBIGUO' },
      { id: '1003', label: 'ROLL AMBIGUO' },
    ];

    const exact = matchName('ROLL EXACTO', targets);
    expect(exact.status).toBe('matched');
    if (exact.status === 'matched') expect(exact.method).toBe('canonical-exact');

    const ambiguous = matchName('ROLL AMBIGUO', targets);
    expect(ambiguous.status).toBe('ambiguous');
    if (ambiguous.status === 'ambiguous') {
      expect(ambiguous.requiresHuman).toBe(true);
      expect(ambiguous.candidates.map((candidate) => candidate.id)).toEqual(['1002', '1003']);
    }
  });

  it('clasifica los SVG sintéticos según los casos reales descubiertos', async () => {
    const editable = analyzeSvg(await fixture('svg/ROLL EXACTO.svg'));
    const split = analyzeSvg(await fixture('svg/ROLL SEGUNDO.svg'));
    const absent = analyzeSvg(await fixture('svg/SIN PRECIO.svg'));
    const replaced = analyzeSvg(await fixture('svg/PRECIO EDITABLE EXISTENTE.svg'));
    const ambiguous = analyzeSvg(await fixture('svg/ERROR PLACEHOLDER DUPLICADO.svg'));

    expect(editable.engineClassification).toBe('editable-placeholder');
    expect(split.engineClassification).toBe('split-text-placeholder');
    expect(absent.engineClassification).toBe('price-absent');
    expect(replaced.engineClassification).toBe('already-replaced-editable-price');
    expect(ambiguous.engineClassification).toBe('unknown');
    expect(ambiguous.diagnostics.map((item) => item.code)).toContain('svg.placeholder-ambiguous');
  });
});
