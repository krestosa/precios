import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROL_VERSION,
  EXPECTED_COMMANDS,
  assertJsonSerializableState,
  bootControlRuntime,
  getPath,
  isRecord,
  type ControlApi,
} from './control-api-testkit';

describe('Control API productiva', () => {
  let api: ControlApi;
  let readyDetail: unknown;

  beforeAll(async () => {
    ({ api, readyDetail } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('publica ready, versión, comandos, estado y diagnósticos reales', async () => {
    expect(api.version).toBe(CONTROL_VERSION);
    expect(getPath(readyDetail, 'version')).toBe(CONTROL_VERSION);

    const commands = api.listCommands();
    expect(commands.map((command) => command.name)).toEqual(EXPECTED_COMMANDS);
    expect(getPath(readyDetail, 'commands')).toEqual(commands);

    const state = api.getState();
    const diagnostics = api.getDiagnostics();
    expect(getPath(state, 'contractVersion')).toBe(CONTROL_VERSION);
    expect(getPath(state, 'ready')).toBe(true);
    expect(getPath(diagnostics, 'contractVersion')).toBe(CONTROL_VERSION);
    expect(getPath(diagnostics, 'ready')).toBe(true);

    const commandState = await api.execute('state.get');
    expect(commandState.ok).toBe(true);
    if (commandState.ok) expect(commandState.value).toEqual(state);
  });

  it('expone un getState estrictamente JSON-serializable', () => {
    assertJsonSerializableState(api.getState());
    assertJsonSerializableState(api.getDiagnostics());
  });

  it('rechaza comandos desconocidos y payloads inválidos sin matar la UI', async () => {
    const unknown = await api.execute('qa.command.que-no-existe');
    expect(unknown.ok).toBe(false);
    if (unknown.ok === false) expect(unknown.error.code).toBe('unknown-command');

    const pathInsteadOfFile = await api.execute('source.load', { files: ['C:\\precios\\fixture.csv'] });
    expect(pathInsteadOfFile.ok).toBe(false);
    if (pathInsteadOfFile.ok === false) expect(pathInsteadOfFile.error.code).toBe('invalid-payload');

    const invalidPreview = await api.execute('preview.setMode', { mode: 'side-by-side' });
    expect(invalidPreview.ok).toBe(false);
    if (invalidPreview.ok === false) expect(invalidPreview.error.code).toBe('invalid-payload');

    expect(document.querySelectorAll('#app > pw-price-workbench')).toHaveLength(1);
    expect(getPath(api.getState(), 'ready')).toBe(true);
    const diagnostics = api.getDiagnostics();
    expect(isRecord(diagnostics)).toBe(true);
    expect(getPath(diagnostics, 'errors')).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown-command'),
      expect.stringContaining('invalid-payload'),
    ]));
  });

  it('hace flow.reset idempotente y restaura el estado inicial observable', async () => {
    const mode = await api.execute('preview.setMode', { mode: 'overlay' });
    expect(mode.ok).toBe(true);
    expect(getPath(api.getState(), 'view', 'previewMode')).toBe('overlay');

    const first = await api.execute('flow.reset');
    expect(first.ok).toBe(true);
    const afterFirst = api.getState();

    const second = await api.execute('flow.reset');
    expect(second.ok).toBe(true);
    const afterSecond = api.getState();

    expect(afterSecond).toEqual(afterFirst);
    expect(getPath(afterSecond, 'source', 'status')).toBe('empty');
    expect(getPath(afterSecond, 'counts', 'priceSources')).toBe(0);
    expect(getPath(afterSecond, 'counts', 'svgFiles')).toBe(0);
    expect(getPath(afterSecond, 'view', 'previewMode')).toBe('result');
    expect(getPath(afterSecond, 'view', 'zoom')).toBe(1);
  });
});
