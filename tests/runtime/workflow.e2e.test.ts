import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootControlRuntime,
  containsScalar,
  executeAndWaitForState,
  findRecordByStringField,
  getPath,
  isRecord,
  workbenchModel,
  type ControlApi,
} from './control-api-testkit';

async function fixture(path: string): Promise<string> {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), 'utf8');
}

function asFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

async function loadPricingSource(api: ControlApi): Promise<unknown> {
  const csv = await fixture('pricing/workflow-prices.csv');
  return executeAndWaitForState(
    api,
    'source.load',
    { files: asFile(csv, 'workflow-prices.csv', 'text/csv') },
    (state) => getPath(state, 'source', 'status') === 'ready'
      && getPath(state, 'source', 'fileName') === 'workflow-prices.csv'
      && getPath(state, 'counts', 'priceSources') === 1,
  );
}

async function loadSvg(api: ControlApi, fixtureName: string): Promise<unknown> {
  const svg = await fixture(`svg/${fixtureName}`);
  return executeAndWaitForState(
    api,
    'svg.load',
    { files: asFile(svg, fixtureName, 'image/svg+xml') },
    (state) => getPath(state, 'loads', 'svgStatus') === 'ready'
      && getPath(state, 'counts', 'svgFiles') === 1,
  );
}

function matchCandidatesFromWorkbench(): readonly Record<string, unknown>[] {
  const model = workbenchModel();
  if (!isRecord(model) || !Array.isArray(model['files'])) return [];
  const selected = model['files'][0];
  if (!isRecord(selected) || !isRecord(selected['match']) || !Array.isArray(selected['match']['candidates'])) return [];
  return selected['match']['candidates'].filter(isRecord);
}

describe('workflow productivo por Control API', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('source.load usa File local y vuelve observables productos y precios explícitos', async () => {
    const state = await loadPricingSource(api);
    expect(getPath(state, 'source', 'status')).toBe('ready');
    expect(getPath(state, 'counts', 'priceSources')).toBe(1);

    // El contrato E2E exige que el estado de control permita observar el resultado del parsing.
    expect(containsScalar(state, 'ROLL EXACTO')).toBe(true);
    expect(containsScalar(state, 10000) || containsScalar(state, '10000')).toBe(true);
    expect(containsScalar(state, 7500) || containsScalar(state, '7500')).toBe(true);
  });

  it('svg.load expone clasificación y matching exacto sin selección manual', async () => {
    await loadPricingSource(api);
    const state = await loadSvg(api, 'ROLL EXACTO.svg');

    expect(getPath(state, 'view', 'selectedFileName')).toBe('ROLL EXACTO.svg');
    expect(containsScalar(state, 'price-editable')).toBe(true);
    expect(getPath(state, 'matching', 'status')).toBe('matched');
    expect(getPath(state, 'matching', 'method')).toBe('canonical-exact');
    expect(getPath(state, 'matching', 'requiresHuman')).toBe(false);

    // NORMAL y ÉMINENT deben seguir siendo datos fuente explícitos, no una inferencia oculta.
    expect(containsScalar(state, 'NORMAL')).toBe(true);
    expect(containsScalar(state, 'EMINENT')).toBe(true);
    expect(containsScalar(state, 10000) || containsScalar(state, '10000')).toBe(true);
    expect(containsScalar(state, 7500) || containsScalar(state, '7500')).toBe(true);
  });

  it('mantiene matching ambiguo hasta aplicar una elección humana', async () => {
    await loadPricingSource(api);
    const ambiguous = await loadSvg(api, 'ROLL AMBIGUO.svg');

    expect(getPath(ambiguous, 'matching', 'status')).toBe('ambiguous');
    expect(getPath(ambiguous, 'matching', 'requiresHuman')).toBe(true);
    expect(getPath(ambiguous, 'matching', 'selectedCandidateId')).toBeNull();

    const candidates = matchCandidatesFromWorkbench();
    expect(candidates).toHaveLength(2);
    const candidateId = candidates[0]?.['id'];
    expect(typeof candidateId).toBe('string');
    if (typeof candidateId !== 'string') throw new Error('No hay candidateId observable para resolver el matching.');

    const fileId = getPath(api.getState(), 'view', 'selectedFileId');
    expect(typeof fileId).toBe('string');
    if (typeof fileId !== 'string') throw new Error('No hay fileId seleccionado.');

    const chosen = await executeAndWaitForState(
      api,
      'matching.choose',
      { fileId, candidateId },
      (state) => getPath(state, 'matching', 'selectedCandidateId') === candidateId,
    );
    expect(getPath(chosen, 'matching', 'status')).toBe('ambiguous');

    const applied = await executeAndWaitForState(
      api,
      'matching.apply',
      { fileId, candidateId, scope: 'session' },
      (state) => getPath(state, 'matching', 'status') === 'matched'
        && getPath(state, 'matching', 'method') === 'manual',
    );
    expect(getPath(applied, 'matching', 'selectedCandidateId')).toBe(candidateId);
    expect(getPath(applied, 'matching', 'requiresHuman')).toBe(false);
  });

  it('preflight conserva OK/WARNING/ERROR por SVG y bloquea sólo el ERROR', async () => {
    await loadPricingSource(api);
    const names = ['SIN PRECIO.svg', 'PRECIO EDITABLE EXISTENTE.svg', 'ERROR PLACEHOLDER DUPLICADO.svg'];
    const files = await Promise.all(names.map(async (name) => asFile(await fixture(`svg/${name}`), name, 'image/svg+xml')));

    await executeAndWaitForState(
      api,
      'svg.load',
      { files },
      (state) => getPath(state, 'loads', 'svgStatus') === 'ready' && getPath(state, 'counts', 'svgFiles') === 3,
    );

    const preflightState = await executeAndWaitForState(
      api,
      'preflight.run',
      undefined,
      (state) => getPath(state, 'preflight', 'fileCount') === 3,
    );

    expect(getPath(preflightState, 'preflight', 'blockingFiles')).toBe(1);
    const model = workbenchModel();
    const absent = findRecordByStringField(model, 'fileName', 'SIN PRECIO.svg');
    const warning = findRecordByStringField(model, 'fileName', 'PRECIO EDITABLE EXISTENTE.svg');
    const error = findRecordByStringField(model, 'fileName', 'ERROR PLACEHOLDER DUPLICADO.svg');
    expect(absent).not.toBeNull();
    expect(warning).not.toBeNull();
    expect(error).not.toBeNull();

    const absentPreflight = absent?.['preflight'];
    const warningPreflight = warning?.['preflight'];
    const errorPreflight = error?.['preflight'];
    expect(getPath(absentPreflight, 'blocking')).toBe(false);
    expect(getPath(warningPreflight, 'blocking')).toBe(false);
    expect(getPath(errorPreflight, 'blocking')).toBe(true);
    expect(containsScalar(absentPreflight, 'OK')).toBe(true);
    expect(containsScalar(warningPreflight, 'WARNING')).toBe(true);
    expect(containsScalar(errorPreflight, 'ERROR')).toBe(true);
  });

  it('refleja ORIGINAL/RESULT/OVERLAY, fit y zoom en el estado', async () => {
    await loadPricingSource(api);
    await loadSvg(api, 'ROLL EXACTO.svg');

    for (const mode of ['original', 'result', 'overlay'] as const) {
      const next = await executeAndWaitForState(
        api,
        'preview.setMode',
        { mode },
        (state) => getPath(state, 'view', 'previewMode') === mode,
      );
      expect(getPath(next, 'view', 'previewMode')).toBe(mode);
    }

    const beforeZoom = getPath(api.getState(), 'view', 'zoom');
    expect(typeof beforeZoom).toBe('number');
    const zoomed = await executeAndWaitForState(
      api,
      'preview.zoomIn',
      undefined,
      (state) => typeof getPath(state, 'view', 'zoom') === 'number'
        && Number(getPath(state, 'view', 'zoom')) > Number(beforeZoom),
    );
    expect(Number(getPath(zoomed, 'view', 'zoom'))).toBeGreaterThan(Number(beforeZoom));

    const fit = await executeAndWaitForState(
      api,
      'preview.fit',
      undefined,
      (state) => getPath(state, 'view', 'zoom') === 1,
    );
    expect(getPath(fit, 'view', 'zoom')).toBe(1);
  });

  it('export.request debe producir un resultado observable y no sólo aceptar el evento', async () => {
    await loadPricingSource(api);
    await loadSvg(api, 'ROLL EXACTO.svg');
    await executeAndWaitForState(api, 'preflight.run', undefined, (state) => getPath(state, 'preflight', 'fileCount') === 1);

    const before = JSON.stringify(api.getState());
    const result = await api.execute('export.request', { kind: 'zip' });
    expect(result.ok).toBe(true);

    const after = api.getState();
    expect(JSON.stringify(after), 'export.request debe dejar un resultado observable en el estado de runtime').not.toBe(before);
    expect(containsScalar(after, 'generated')).toBe(true);
    expect(containsScalar(after, 'zip') || containsScalar(after, 'manifest')).toBe(true);
    expect(containsScalar(after, 'sha256') || containsScalar(after, 'SHA-256')).toBe(true);
  });

  it('reset posterior al flujo devuelve el snapshot inicial consistente', async () => {
    await loadPricingSource(api);
    await loadSvg(api, 'ROLL EXACTO.svg');
    await api.execute('preview.setMode', { mode: 'overlay' });

    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
    const state = api.getState();
    expect(getPath(state, 'source', 'status')).toBe('empty');
    expect(getPath(state, 'counts', 'priceSources')).toBe(0);
    expect(getPath(state, 'counts', 'svgFiles')).toBe(0);
    expect(getPath(state, 'view', 'selectedFileId')).toBeNull();
    expect(getPath(state, 'view', 'previewMode')).toBe('result');
    expect(getPath(state, 'view', 'zoom')).toBe(1);
    expect(getPath(state, 'preflight')).toBeNull();
  });
});
