import type { RawTextRange } from './model';

export interface XmlElementRecord {
  readonly tag: string;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface XmlTextSegment extends RawTextRange {
  readonly concatStart: number;
  readonly concatEnd: number;
}

export interface XmlTextRegion {
  readonly id: number;
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly segments: readonly XmlTextSegment[];
}

export interface XmlScanResult {
  readonly elements: readonly XmlElementRecord[];
  readonly textRegions: readonly XmlTextRegion[];
}

interface MutableFrame {
  readonly tag: string;
  readonly path: string;
  readonly attributes: Record<string, string>;
  readonly childCounts: Map<string, number>;
  readonly textRegionId?: number;
}

interface MutableRegion {
  readonly id: number;
  readonly path: string;
  readonly start: number;
  end: number;
  text: string;
  readonly segments: XmlTextSegment[];
}

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[^>]*\?>|<![^>]*>|<[^>]+>|[^<]+/g;
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXmlAttributes(rawTag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(rawTag)) !== null) {
    const name = match[1];
    if (name === undefined) continue;
    attributes[name] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function parseStyle(style: string | undefined): Record<string, string> {
  if (style === undefined) return {};
  const output: Record<string, string> = {};
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const key = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (key !== '') output[key] = value;
  }
  return output;
}

function mergedAttributes(stack: readonly MutableFrame[]): Record<string, string> {
  const merged: Record<string, string> = {};
  const style: Record<string, string> = {};
  const transforms: string[] = [];

  for (const frame of stack) {
    for (const [key, value] of Object.entries(frame.attributes)) {
      if (key === 'style' || key === 'transform') continue;
      merged[key] = value;
    }
    Object.assign(style, parseStyle(frame.attributes['style']));
    const transform = frame.attributes['transform'];
    if (transform !== undefined) transforms.push(transform);
  }

  if (Object.keys(style).length > 0) {
    merged['style'] = Object.entries(style)
      .map(([key, value]) => `${key}:${value}`)
      .join(';');
  }
  if (transforms.length > 0) merged['transform'] = transforms.join(' ');
  return merged;
}

function tagName(rawTag: string): string | undefined {
  const match = /^<\/?\s*([A-Za-z_][\w:.-]*)/.exec(rawTag);
  return match?.[1];
}

function activeTextRegionId(stack: readonly MutableFrame[]): number | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const value = stack[index]?.textRegionId;
    if (value !== undefined) return value;
  }
  return undefined;
}

function nearestTextFrame(stack: readonly MutableFrame[]): MutableFrame | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame?.tag === 'tspan' || frame?.tag === 'text') return frame;
  }
  return undefined;
}

export function scanSvgXml(xml: string): XmlScanResult {
  const stack: MutableFrame[] = [];
  const elements: XmlElementRecord[] = [];
  const regions: MutableRegion[] = [];
  const regionById = new Map<number, MutableRegion>();
  let nextRegionId = 0;
  TOKEN_RE.lastIndex = 0;

  let token: RegExpExecArray | null;
  while ((token = TOKEN_RE.exec(xml)) !== null) {
    const raw = token[0];
    const start = token.index;
    const end = start + raw.length;

    if (raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<!')) continue;

    if (raw.startsWith('</')) {
      const closing = tagName(raw);
      if (closing === undefined) continue;
      const frame = stack.pop();
      if (frame === undefined || frame.tag !== closing) continue;
      if (frame.tag === 'text' && frame.textRegionId !== undefined) {
        const region = regionById.get(frame.textRegionId);
        if (region !== undefined) region.end = end;
      }
      continue;
    }

    if (raw.startsWith('<')) {
      const tag = tagName(raw);
      if (tag === undefined) continue;
      const parent = stack[stack.length - 1];
      const count = (parent?.childCounts.get(tag) ?? 0) + 1;
      parent?.childCounts.set(tag, count);
      const path = `${parent?.path ?? ''}/${tag}[${count}]`;
      const attributes = parseXmlAttributes(raw);
      const isSelfClosing = /\/\s*>$/.test(raw);
      let textRegionId = activeTextRegionId(stack);

      if (tag === 'text') {
        textRegionId = nextRegionId;
        nextRegionId += 1;
        const region: MutableRegion = {
          id: textRegionId,
          path,
          start,
          end,
          text: '',
          segments: [],
        };
        regions.push(region);
        regionById.set(textRegionId, region);
      }

      const frame: MutableFrame = {
        tag,
        path,
        attributes,
        childCounts: new Map<string, number>(),
        ...(textRegionId === undefined ? {} : { textRegionId }),
      };
      elements.push({ tag, path, start, end, attributes });
      if (!isSelfClosing) stack.push(frame);
      continue;
    }

    const regionId = activeTextRegionId(stack);
    if (regionId === undefined || raw.length === 0) continue;
    const region = regionById.get(regionId);
    const nearest = nearestTextFrame(stack);
    if (region === undefined || nearest === undefined) continue;

    const concatStart = region.text.length;
    region.text += raw;
    const inherited = mergedAttributes(stack.filter((frame) => frame.textRegionId === regionId));
    region.segments.push({
      start,
      end,
      text: raw,
      textRegionId: regionId,
      elementPath: nearest.path,
      attributes: nearest.attributes,
      inheritedAttributes: inherited,
      concatStart,
      concatEnd: concatStart + raw.length,
    });
  }

  return {
    elements,
    textRegions: regions.map((region) => ({
      id: region.id,
      path: region.path,
      start: region.start,
      end: region.end,
      text: region.text,
      segments: region.segments,
    })),
  };
}

export function rangesForOccurrence(
  region: XmlTextRegion,
  start: number,
  length: number,
): RawTextRange[] {
  const occurrenceEnd = start + length;
  const ranges: RawTextRange[] = [];

  for (const segment of region.segments) {
    const overlapStart = Math.max(start, segment.concatStart);
    const overlapEnd = Math.min(occurrenceEnd, segment.concatEnd);
    if (overlapStart >= overlapEnd) continue;
    const localStart = overlapStart - segment.concatStart;
    const localEnd = overlapEnd - segment.concatStart;
    ranges.push({
      start: segment.start + localStart,
      end: segment.start + localEnd,
      text: segment.text.slice(localStart, localEnd),
      textRegionId: segment.textRegionId,
      elementPath: segment.elementPath,
      attributes: segment.attributes,
      inheritedAttributes: segment.inheritedAttributes,
    });
  }

  return ranges;
}
