import {
  PRECIOS_APP_CONTROL_EVENTS,
  type PreciosAppControlApi,
  type PreciosAppControlResult,
  type PreciosAppResultEventDetail,
  type PreciosAppStateChangeEventDetail,
  type PreciosAppStateSnapshot,
} from '../features/ui/control-api/types';
import type { PriceWorkbench } from '../features/ui/workbench';
import type { AppRuntimeController, AppRuntimeSnapshot } from './types';

interface ExtendedState extends PreciosAppStateSnapshot {
  readonly runtime: AppRuntimeSnapshot;
}

type MutableResultDetail = {
  requestId: string;
  command: string;
  result: PreciosAppControlResult;
};

type MutableStateDetail = {
  version: string;
  state: PreciosAppStateSnapshot;
};

const ADAPTER_SLOT = '__preciosAppControlAdapterV1' as const;
type AdapterHost = PriceWorkbench & { [ADAPTER_SLOT]?: () => void };

export function installAppControlAdapter(workbench: PriceWorkbench, runtime: AppRuntimeController): () => void {
  const host = workbench as AdapterHost;
  host[ADAPTER_SLOT]?.();
  const base = window.preciosApp;
  if (base === undefined) throw new Error('La Control API debe instalarse antes del adaptador de composición.');

  const extend = (state: PreciosAppStateSnapshot): ExtendedState => ({
    ...state,
    runtime: runtime.snapshot(),
  });

  let lastStateEvent = '';

  const api: PreciosAppControlApi = {
    version: base.version,
    listCommands: () => base.listCommands(),
    getState: () => extend(base.getState()),
    getDiagnostics: () => base.getDiagnostics(),
    execute: async (command, payload) => {
      if (command === 'state.get' && payload === undefined) {
        return { ok: true, value: extend(base.getState()) };
      }
      const result = await base.execute(command, payload);
      if (result.ok) await runtime.waitFor(command);
      return result;
    },
    subscribe: (listener) => {
      let last = '';
      const emit = (): void => {
        const state = extend(base.getState());
        const serialized = JSON.stringify(state);
        if (serialized === last) return;
        last = serialized;
        listener(state);
      };
      const stopBase = base.subscribe(() => emit());
      const stopRuntime = runtime.subscribe(() => emit());
      emit();
      return () => { stopBase(); stopRuntime(); };
    },
  };

  const onResult = (event: CustomEvent<PreciosAppResultEventDetail>): void => {
    if (event.detail.command !== 'state.get' || !event.detail.result.ok) return;
    const detail = event.detail as unknown as MutableResultDetail;
    detail.result = { ok: true, value: extend(base.getState()) };
  };

  const onStateChange = (event: CustomEvent<PreciosAppStateChangeEventDetail>): void => {
    const detail = event.detail as unknown as MutableStateDetail;
    const state = extend(base.getState());
    detail.state = state;
    lastStateEvent = JSON.stringify(state);
  };

  const stopRuntimeStateEvent = runtime.subscribe(() => {
    const state = extend(base.getState());
    const serialized = JSON.stringify(state);
    if (serialized === lastStateEvent) return;
    lastStateEvent = serialized;
    window.dispatchEvent(new CustomEvent(PRECIOS_APP_CONTROL_EVENTS.stateChange, {
      detail: { version: base.version, state },
    }));
  });

  window.addEventListener(PRECIOS_APP_CONTROL_EVENTS.result, onResult);
  window.addEventListener(PRECIOS_APP_CONTROL_EVENTS.stateChange, onStateChange);
  window.preciosApp = api;

  const dispose = (): void => {
    window.removeEventListener(PRECIOS_APP_CONTROL_EVENTS.result, onResult);
    window.removeEventListener(PRECIOS_APP_CONTROL_EVENTS.stateChange, onStateChange);
    stopRuntimeStateEvent();
    if (window.preciosApp === api) window.preciosApp = base;
    if (host[ADAPTER_SLOT] === dispose) delete host[ADAPTER_SLOT];
  };
  host[ADAPTER_SLOT] = dispose;
  return dispose;
}
