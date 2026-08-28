import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROL_EVENTS,
  bootControlRuntime,
  getPath,
  onceWindowEvent,
  type ControlApi,
} from './control-api-testkit';

async function busCommand(requestId: string, command: string, payload?: unknown): Promise<unknown> {
  const result = onceWindowEvent(
    CONTROL_EVENTS.result,
    (detail) => getPath(detail, 'requestId') === requestId && getPath(detail, 'command') === command,
  );
  window.dispatchEvent(new CustomEvent(CONTROL_EVENTS.command, {
    detail: payload === undefined ? { requestId, command } : { requestId, command, payload },
  }));
  return result;
}

describe('CustomEvent command bus', () => {
  let api: ControlApi;

  beforeAll(async () => {
    ({ api } = await bootControlRuntime());
  });

  beforeEach(async () => {
    const reset = await api.execute('flow.reset');
    expect(reset.ok).toBe(true);
  });

  it('correlaciona requestId y devuelve el mismo state.get que execute()', async () => {
    const direct = await api.execute('state.get');
    expect(direct.ok).toBe(true);

    const bus = await busCommand('qa-state-001', 'state.get');
    expect(getPath(bus, 'requestId')).toBe('qa-state-001');
    expect(getPath(bus, 'command')).toBe('state.get');
    expect(getPath(bus, 'result')).toEqual(direct);
    expect(getPath(bus, 'result', 'value')).toEqual(api.getState());
  });

  it('emite result + error correlacionados para un comando inválido sin romper el runtime', async () => {
    const errorEvent = onceWindowEvent(
      CONTROL_EVENTS.error,
      (detail) => getPath(detail, 'requestId') === 'qa-error-001',
    );
    const result = await busCommand('qa-error-001', 'qa.command.que-no-existe');
    const error = await errorEvent;

    expect(getPath(result, 'result', 'ok')).toBe(false);
    expect(getPath(result, 'result', 'error', 'code')).toBe('unknown-command');
    expect(getPath(error, 'command')).toBe('qa.command.que-no-existe');
    expect(getPath(error, 'error', 'code')).toBe('unknown-command');
    expect(getPath(api.getState(), 'ready')).toBe(true);
    expect(document.querySelectorAll('#app > pw-price-workbench')).toHaveLength(1);
  });

  it('flow.reset por execute() y por bus deja el mismo efecto observable', async () => {
    await api.execute('preview.setMode', { mode: 'overlay' });
    const directReset = await api.execute('flow.reset');
    expect(directReset.ok).toBe(true);
    const directState = api.getState();

    await api.execute('preview.setMode', { mode: 'original' });
    const busReset = await busCommand('qa-reset-001', 'flow.reset');
    expect(getPath(busReset, 'result', 'ok')).toBe(true);
    const busState = api.getState();

    expect(busState).toEqual(directState);
  });
});
