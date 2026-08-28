import { expect } from 'vitest';

export const CONTROL_VERSION = '1.0' as const;

export const CONTROL_EVENTS = {
  ready: 'precios-app:v1:ready',
  command: 'precios-app:v1:command',
  result: 'precios-app:v1:result',
  stateChange: 'precios-app:v1:state-change',
  error: 'precios-app:v1:error',
} as const;

export const EXPECTED_COMMANDS = [
  'state.get',
  'flow.reset',
  'source.load',
  'source.selectSheet',
  'svg.load',
  'font.load',
  'file.select',
  'matching.choose',
  'matching.apply',
  'preflight.run',
  'preview.setMode',
  'preview.fit',
  'preview.zoomIn',
  'preview.zoomOut',
  'preview.reset',
  'issue.run',
  'export.request',
] as const;

export type ControlFailure = {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  };
};

export type ControlResult = { readonly ok: true; readonly value?: unknown } | ControlFailure;

export interface ControlApi {
  readonly version: string;
  listCommands(): readonly { readonly name: string; readonly payload: string }[];
  getState(): unknown;
  getDiagnostics(): unknown;
  execute(command: string, payload?: unknown): Promise<ControlResult>;
  subscribe(listener: (state: unknown) => void): () => void;
}

type WindowWithControl = Window & { preciosApp?: ControlApi };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireControlApi(): ControlApi {
  const api = (window as WindowWithControl).preciosApp;
  expect(api, 'window.preciosApp debe estar instalado por el runtime').toBeDefined();
  if (!api) throw new Error('window.preciosApp no está disponible.');
  return api;
}

export function onceWindowEvent(
  name: string,
  predicate: (detail: unknown) => boolean = () => true,
): Promise<unknown> {
  return new Promise((resolve) => {
    const listener = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !predicate(event.detail)) return;
      window.removeEventListener(name, listener);
      resolve(event.detail);
    };
    window.addEventListener(name, listener);
  });
}

export async function bootControlRuntime(): Promise<{ readonly api: ControlApi; readonly readyDetail: unknown }> {
  document.body.innerHTML = '<main id="app" aria-label="Aplicación de actualización de precios"></main>';
  Reflect.deleteProperty(window, 'preciosApp');

  const ready = onceWindowEvent(CONTROL_EVENTS.ready);
  await import('../../src/main');
  const api = requireControlApi();
  const readyDetail = await ready;
  return { api, readyDetail };
}

export async function expectAccepted(result: Promise<ControlResult> | ControlResult): Promise<void> {
  const resolved = await result;
  if (resolved.ok === false) throw new Error(`${resolved.error.code}: ${resolved.error.message}`);
  expect(resolved.ok).toBe(true);
}

export async function executeAndWaitForState(
  api: ControlApi,
  command: string,
  payload: unknown,
  predicate: (state: unknown) => boolean,
): Promise<unknown> {
  const before = JSON.stringify(api.getState());
  let unsubscribe: () => void = () => undefined;
  let completed = false;

  const transition = new Promise<unknown>((resolve) => {
    unsubscribe = api.subscribe((state) => {
      if (completed || JSON.stringify(state) === before || !predicate(state)) return;
      completed = true;
      unsubscribe();
      resolve(state);
    });
  });

  const result = await api.execute(command, payload);
  if (result.ok === false) {
    unsubscribe();
    throw new Error(`${command} rechazado: ${result.error.code}: ${result.error.message}`);
  }

  const immediate = api.getState();
  if (JSON.stringify(immediate) !== before && predicate(immediate)) {
    completed = true;
    unsubscribe();
    return immediate;
  }

  return transition;
}

export function assertJsonSerializableState(value: unknown): void {
  expect(() => JSON.stringify(value)).not.toThrow();
  const seen = new WeakSet<object>();

  const visit = (current: unknown, path: string): void => {
    const kind = typeof current;
    expect(kind, `${path} no puede contener functions`).not.toBe('function');
    expect(kind, `${path} no puede contener symbols`).not.toBe('symbol');
    expect(kind, `${path} no puede contener bigint`).not.toBe('bigint');
    expect(current, `${path} no puede contener undefined`).not.toBeUndefined();

    if (current === null || kind !== 'object') return;
    expect(current instanceof File, `${path} no puede contener File`).toBe(false);
    expect(current instanceof Node, `${path} no puede contener DOM Node`).toBe(false);
    expect(current instanceof Event, `${path} no puede contener Event`).toBe(false);

    const object = current as object;
    if (seen.has(object)) throw new Error(`Referencia circular en ${path}.`);
    seen.add(object);

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }

    Object.entries(current as Record<string, unknown>).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };

  visit(value, '$');
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

export function containsScalar(root: unknown, expected: string | number | boolean | null): boolean {
  if (Object.is(root, expected)) return true;
  if (Array.isArray(root)) return root.some((entry) => containsScalar(entry, expected));
  if (!isRecord(root)) return false;
  return Object.values(root).some((entry) => containsScalar(entry, expected));
}

export function findRecordByStringField(
  root: unknown,
  key: string,
  expected: string,
): Record<string, unknown> | null {
  if (Array.isArray(root)) {
    for (const entry of root) {
      const found = findRecordByStringField(entry, key, expected);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(root)) return null;
  if (root[key] === expected) return root;
  for (const entry of Object.values(root)) {
    const found = findRecordByStringField(entry, key, expected);
    if (found) return found;
  }
  return null;
}

export function getPath(root: unknown, ...keys: string[]): unknown {
  let current = root;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function workbenchModel(): unknown {
  const workbench = document.querySelector('pw-price-workbench') as (HTMLElement & { model?: unknown }) | null;
  expect(workbench, 'debe existir el workbench real').not.toBeNull();
  return workbench?.model;
}
