import type { RawPatchEdit, ProtectedFingerprints, SvgIntegrityAudit } from './model';
import { scanSvgXml } from './xml-scan';

const encoder = new TextEncoder();

function hashBuffer(value: string | Uint8Array): ArrayBuffer {
  if (typeof value === 'string') return encoder.encode(value).buffer;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error('Web Crypto no está disponible para calcular SHA-256.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', hashBuffer(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function extractBlocks(svg: string, tag: string): string[] {
  const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
  const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/\\s*>`, 'gi');
  return [...(svg.match(paired) ?? []), ...(svg.match(selfClosing) ?? [])];
}

async function hashJson(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}

export async function fingerprintSvgProtectedStructure(
  svg: string,
  protectedBytes: string = svg,
): Promise<ProtectedFingerprints> {
  const scan = scanSvgXml(svg);
  const paths = scan.elements
    .filter((element) => element.tag === 'path')
    .map((element) => element.attributes['d'] ?? null);
  const images = scan.elements
    .filter((element) => element.tag === 'image')
    .map((element) => ({
      href: element.attributes['href'] ?? null,
      xlinkHref: element.attributes['xlink:href'] ?? null,
    }));
  const root = scan.elements.find((element) => element.tag === 'svg');
  const rootGeometry = root === undefined
    ? null
    : {
        viewBox: root.attributes['viewBox'] ?? null,
        width: root.attributes['width'] ?? null,
        height: root.attributes['height'] ?? null,
      };
  const gradients = [
    ...extractBlocks(svg, 'linearGradient'),
    ...extractBlocks(svg, 'radialGradient'),
  ];

  return {
    protectedBytesSha256: await sha256Hex(protectedBytes),
    pathsSha256: await hashJson(paths),
    imagesSha256: await hashJson(images),
    rootGeometrySha256: await hashJson(rootGeometry),
    defsSha256: await hashJson(extractBlocks(svg, 'defs')),
    filtersSha256: await hashJson(extractBlocks(svg, 'filter')),
    gradientsSha256: await hashJson(gradients),
    patternsSha256: await hashJson(extractBlocks(svg, 'pattern')),
  };
}

export interface AppliedRawPatch {
  readonly svg: string;
  readonly protectedOriginal: string;
  readonly protectedResult: string;
  readonly edits: readonly RawPatchEdit[];
}

export function applyRawPatch(original: string, edits: readonly RawPatchEdit[]): AppliedRawPatch {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0;
  let result = '';
  let protectedOriginal = '';
  let protectedResult = '';

  for (const edit of ordered) {
    if (edit.start < cursor || edit.start < 0 || edit.end < edit.start || edit.end > original.length) {
      throw new Error('Los rangos de patch se superponen o están fuera del SVG original.');
    }
    const untouched = original.slice(cursor, edit.start);
    result += untouched + edit.replacement;
    protectedOriginal += untouched;
    protectedResult += untouched;
    cursor = edit.end;
  }

  const tail = original.slice(cursor);
  result += tail;
  protectedOriginal += tail;
  protectedResult += tail;
  return { svg: result, protectedOriginal, protectedResult, edits: ordered };
}

function differingFingerprintKeys(
  original: ProtectedFingerprints,
  result: ProtectedFingerprints,
): string[] {
  const keys = Object.keys(original) as Array<keyof ProtectedFingerprints>;
  return keys.filter((key) => original[key] !== result[key]);
}

export async function auditRawPatchIntegrity(
  originalSvg: string,
  patch: AppliedRawPatch,
): Promise<SvgIntegrityAudit> {
  const original = await fingerprintSvgProtectedStructure(originalSvg, patch.protectedOriginal);
  const result = await fingerprintSvgProtectedStructure(patch.svg, patch.protectedResult);
  const differences = differingFingerprintKeys(original, result);
  const unexpectedDifferences = differences.filter((key) => key !== 'protectedBytesSha256');
  return {
    ok: unexpectedDifferences.length === 0 && original.protectedBytesSha256 === result.protectedBytesSha256,
    original,
    result,
    allowedDifferences: patch.edits.map((edit) => `${edit.start}:${edit.end}:${edit.reason}`),
    unexpectedDifferences,
  };
}
