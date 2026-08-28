import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

async function importBootstrap(): Promise<void> {
  await import('../../src/main');
}

describe('bootstrap de la aplicación', () => {
  it('marca el contenedor raíz como listo', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.resetModules();

    await importBootstrap();

    expect(document.querySelector<HTMLElement>('#app')?.dataset.bootstrap).toBe('ready');
  });

  it('falla de forma explícita cuando falta el contenedor raíz', async () => {
    document.body.innerHTML = '<main id="otro-root"></main>';
    vi.resetModules();

    await expect(importBootstrap()).rejects.toThrow('No se encontró el contenedor raíz de la aplicación.');
  });

  it('no duplica el workbench al reevaluar el composition root', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.resetModules();
    await importBootstrap();

    vi.resetModules();
    await importBootstrap();

    const appRoot = document.querySelector<HTMLElement>('#app');
    const workbenchCount = appRoot?.querySelectorAll(':scope > pw-price-workbench').length ?? 0;
    const workbenchRegistered = customElements.get('pw-price-workbench') !== undefined;

    expect(workbenchCount).toBe(workbenchRegistered ? 1 : 0);
  });

  it('mantiene un único entrypoint de módulo conectado al root esperado', async () => {
    const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const roots = parsed.querySelectorAll('#app');
    const entrypoints = [
      ...parsed.querySelectorAll<HTMLScriptElement>('script[type="module"][src="/src/main.ts"]'),
    ];

    expect(roots).toHaveLength(1);
    expect(entrypoints).toHaveLength(1);
  });
});
