// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/features/font-resolver/metadata', () => ({
  inspectFontUpload: vi.fn(async (input: { readonly name: string; readonly mimeType?: string; readonly bytes: ArrayBuffer }) => ({
    meta: {
      id: 'font-w27-race',
      originalName: input.name,
      size: input.bytes.byteLength,
      ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
      hash: 'w27-race',
      parsed: { family: 'W27 Race', subfamily: 'Regular', weight: 400, style: 'normal' },
    },
    spec: { family: 'W27 Race', subfamily: 'Regular', weight: 400, style: 'normal' },
    diagnostics: [],
  })),
}));

import { BrowserFontResolver } from '../../src/features/font-resolver/resolver';

describe('W27 BrowserFontResolver lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('no registra una FontFace que termina de cargar después de dispose', async () => {
    let releaseLoad: (() => void) | undefined;
    let markLoadStarted: (() => void) | undefined;
    const loadStarted = new Promise<void>((resolve) => { markLoadStarted = resolve; });

    class DeferredFontFace {
      constructor(
        readonly family: string,
        readonly source: ArrayBuffer,
        readonly descriptors: FontFaceDescriptors,
      ) {}

      load(): Promise<FontFace> {
        markLoadStarted?.();
        return new Promise<FontFace>((resolve) => {
          releaseLoad = () => resolve(this as unknown as FontFace);
        });
      }
    }

    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('FontFace', DeferredFontFace);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add,
        delete: remove,
        check: () => false,
      },
    });

    const resolver = new BrowserFontResolver();
    const registration = resolver.registerUpload({
      name: 'w27-race.woff2',
      mimeType: 'font/woff2',
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    });

    await loadStarted;
    resolver.dispose();
    if (!releaseLoad) throw new Error('La carga diferida de FontFace no quedó pendiente.');
    releaseLoad();
    const result = await registration;

    expect(add).not.toHaveBeenCalled();
    expect(resolver.snapshot([]).uploads).toEqual([]);
    expect(result.status).toBe('rejected');
  });
});