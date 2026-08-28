import * as opentype from 'opentype.js';
import type { Diagnostic } from '../../domain/contracts/core';
import type { FontSpec } from '../../domain/contracts/fonts';
import type { FontUploadInput, InspectedFontUpload } from './model';

interface OpenTypeNameSet {
  readonly fontFamily?: unknown;
  readonly preferredFamily?: unknown;
  readonly fontSubfamily?: unknown;
  readonly preferredSubfamily?: unknown;
}

interface OpenTypeFontLike {
  readonly names?: OpenTypeNameSet;
  readonly tables?: {
    readonly os2?: {
      readonly usWeightClass?: number;
    };
  };
}

const ACCEPTED_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2']);
const ACCEPTED_MIME_TYPES = new Set([
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-sfnt',
  'application/x-font-ttf',
  'application/x-font-opentype',
]);

function extensionOf(name: string): string | undefined {
  const separator = name.lastIndexOf('.');
  if (separator < 0 || separator === name.length - 1) return undefined;
  return name.slice(separator + 1).toLowerCase();
}

function isAcceptedContainer(input: FontUploadInput): boolean {
  const extension = extensionOf(input.name);
  const mimeType = input.mimeType?.toLowerCase();
  return (extension !== undefined && ACCEPTED_EXTENSIONS.has(extension))
    || (mimeType !== undefined && ACCEPTED_MIME_TYPES.has(mimeType));
}

function localizedName(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const english = record['en'];
  if (typeof english === 'string' && english.trim() !== '') return english.trim();
  for (const candidate of Object.values(record)) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return undefined;
}

function weightFromSubfamily(subfamily: string | undefined): number {
  const value = subfamily?.toLowerCase() ?? '';
  if (value.includes('thin')) return 100;
  if (value.includes('extralight') || value.includes('ultralight')) return 200;
  if (value.includes('light')) return 300;
  if (value.includes('medium')) return 500;
  if (value.includes('semibold') || value.includes('demibold')) return 600;
  if (value.includes('extrabold') || value.includes('ultrabold')) return 800;
  if (value.includes('black') || value.includes('heavy')) return 900;
  if (value.includes('bold')) return 700;
  return 400;
}

function styleFromSubfamily(subfamily: string | undefined): string {
  const value = subfamily?.toLowerCase() ?? '';
  if (value.includes('italic')) return 'italic';
  if (value.includes('oblique')) return 'oblique';
  return 'normal';
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error('Web Crypto no está disponible para identificar el archivo de fuente.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function inspectFontUpload(input: FontUploadInput): Promise<InspectedFontUpload> {
  const diagnostics: Diagnostic[] = [];
  const hash = await sha256(input.bytes);
  const id = `font-${hash.slice(0, 16)}`;

  if (!isAcceptedContainer(input)) {
    diagnostics.push({
      code: 'font.container-unsupported',
      message: 'El archivo no declara un contenedor TTF, OTF, WOFF o WOFF2 aceptado.',
      details: { name: input.name, mimeType: input.mimeType ?? null },
    });
    return {
      meta: {
        id,
        originalName: input.name,
        size: input.bytes.byteLength,
        ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
        hash,
      },
      diagnostics,
    };
  }

  try {
    const parsed = opentype.parse(input.bytes) as unknown as OpenTypeFontLike;
    const names = parsed.names;
    const family = localizedName(names?.preferredFamily) ?? localizedName(names?.fontFamily);
    const subfamily = localizedName(names?.preferredSubfamily) ?? localizedName(names?.fontSubfamily);
    if (family === undefined) {
      diagnostics.push({
        code: 'font.metadata-family-missing',
        message: 'La metadata parseada no contiene una familia utilizable; no se permite matching automático.',
      });
      return {
        meta: {
          id,
          originalName: input.name,
          size: input.bytes.byteLength,
          ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
          hash,
        },
        diagnostics,
      };
    }

    const weight = parsed.tables?.os2?.usWeightClass ?? weightFromSubfamily(subfamily);
    const spec: FontSpec = {
      family,
      ...(subfamily === undefined ? {} : { subfamily }),
      weight,
      style: styleFromSubfamily(subfamily),
    };
    return {
      meta: {
        id,
        originalName: input.name,
        size: input.bytes.byteLength,
        ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
        hash,
        parsed: spec,
      },
      spec,
      diagnostics,
    };
  } catch (error) {
    diagnostics.push({
      code: 'font.metadata-parse-failed',
      message: 'No se pudo extraer metadata tipográfica verificable con opentype.js.',
      details: { reason: error instanceof Error ? error.message : String(error) },
    });
    return {
      meta: {
        id,
        originalName: input.name,
        size: input.bytes.byteLength,
        ...(input.mimeType === undefined ? {} : { mimeType: input.mimeType }),
        hash,
      },
      diagnostics,
    };
  }
}
