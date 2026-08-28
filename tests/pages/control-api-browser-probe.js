(async () => {
  const events = {
    ready: 'precios-app:v1:ready',
    command: 'precios-app:v1:command',
    result: 'precios-app:v1:result',
  };

  const waitForReady = async () => {
    if (window.preciosApp) return window.preciosApp;
    await new Promise((resolve) => window.addEventListener(events.ready, resolve, { once: true }));
    if (!window.preciosApp) throw new Error('ready fue emitido pero window.preciosApp no existe.');
    return window.preciosApp;
  };

  const assertJsonSafe = (value) => {
    const seen = new WeakSet();
    const visit = (current, path) => {
      const kind = typeof current;
      if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined') {
        throw new Error(`Valor no serializable en ${path}: ${kind}`);
      }
      if (current === null || kind !== 'object') return;
      if (current instanceof File || current instanceof Node || current instanceof Event) {
        throw new Error(`Objeto runtime no serializable en ${path}.`);
      }
      if (seen.has(current)) throw new Error(`Referencia circular en ${path}.`);
      seen.add(current);
      if (Array.isArray(current)) current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      else Object.entries(current).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
    };
    visit(value, '$');
    JSON.stringify(value);
  };

  const api = await waitForReady();
  if (api.version !== '1.0') throw new Error(`Versión inesperada: ${api.version}`);
  const commands = api.listCommands().map((entry) => entry.name);
  if (!commands.includes('state.get')) throw new Error('state.get no está publicado.');

  const direct = await api.execute('state.get');
  if (!direct.ok) throw new Error(`state.get falló: ${direct.error.code}`);
  assertJsonSafe(direct.value);
  if (JSON.stringify(direct.value) !== JSON.stringify(api.getState())) throw new Error('state.get y getState difieren.');

  const requestId = `browser-probe-${Date.now()}`;
  const busResult = new Promise((resolve) => {
    const listener = (event) => {
      if (event.detail?.requestId !== requestId) return;
      window.removeEventListener(events.result, listener);
      resolve(event.detail);
    };
    window.addEventListener(events.result, listener);
  });
  window.dispatchEvent(new CustomEvent(events.command, { detail: { requestId, command: 'state.get' } }));
  const correlated = await busResult;
  if (!correlated.result?.ok) throw new Error('state.get por bus falló.');
  if (JSON.stringify(correlated.result.value) !== JSON.stringify(api.getState())) {
    throw new Error('El bus y execute() no observan el mismo estado.');
  }

  const result = {
    ok: true,
    version: api.version,
    commandCount: commands.length,
    ready: api.getState().ready === true,
    requestId,
  };
  window.__preciosQaBrowserProbe = result;
  console.log('[precios QA browser probe]', result);
  return result;
})();
