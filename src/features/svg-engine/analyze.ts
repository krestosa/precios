import type { Diagnostic } from '../../domain/contracts/core';
import type { FontSpec } from '../../domain/contracts/fonts';
import type { SvgClass, SvgTargetDescriptor, TextStyleDescriptor } from '../../domain/contracts/svg';
import type {
  EngineSvgClass,
  PriceRole,
  RawTextRange,
  SvgAnalysisResult,
  SvgPriceTargetAnalysis,
  TextRunStyle,
} from './model';
import { rangesForOccurrence, scanSvgXml } from './xml-scan';

const PLACEHOLDERS: ReadonlyArray<{ role: PriceRole; literal: '$$$$' | '@@@@' }> = [
  { role: 'NORMAL', literal: '$$$$' },
  { role: 'EMINENT', literal: '@@@@' },
];

function styleDeclarations(style: string | undefined): Record<string, string> {
  const values: Record<string, string> = {};
  if (style === undefined) return values;
  for (const item of style.split(';')) {
    const separator = item.indexOf(':');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key !== '') values[key] = value;
  }
  return values;
}

function presentationValue(attributes: Readonly<Record<string, string>>, name: string): string | undefined {
  const inline = styleDeclarations(attributes['style'])[name];
  return inline ?? attributes[name];
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?$/i.test(trimmed)) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseWeight(value: string | undefined): number {
  if (value === undefined || value === 'normal') return 400;
  if (value === 'bold') return 700;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

function cleanFamily(value: string): string {
  const first = value.split(',')[0]?.trim() ?? value;
  return first.replace(/^['"]|['"]$/g, '');
}

function resolveTextStyle(range: RawTextRange): TextRunStyle {
  const attributes = range.inheritedAttributes;
  const familyValue = presentationValue(attributes, 'font-family');
  const fontSize = parseNumber(presentationValue(attributes, 'font-size'));
  const letterSpacing = presentationValue(attributes, 'letter-spacing');
  const fill = presentationValue(attributes, 'fill');
  const textAnchorValue = presentationValue(attributes, 'text-anchor');
  const textAnchor = textAnchorValue === 'middle' || textAnchorValue === 'end' ? textAnchorValue : 'start';
  const x = parseNumber(attributes['x']);
  const y = parseNumber(attributes['y']);
  const dx = parseNumber(attributes['dx']);
  const dy = parseNumber(attributes['dy']);
  const transform = attributes['transform'];
  const font: FontSpec | undefined = familyValue === undefined
    ? undefined
    : {
        family: cleanFamily(familyValue),
        weight: parseWeight(presentationValue(attributes, 'font-weight')),
        style: presentationValue(attributes, 'font-style') ?? 'normal',
      };

  return {
    ...(font === undefined ? {} : { font }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    textAnchor,
    ...(fill === undefined ? {} : { fill }),
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(dx === undefined ? {} : { dx }),
    ...(dy === undefined ? {} : { dy }),
    ...(transform === undefined ? {} : { transform }),
    rawAttributes: attributes,
  };
}

function toContractStyle(style: TextRunStyle): TextStyleDescriptor | undefined {
  if (style.font === undefined) return undefined;
  return {
    font: style.font,
    ...(style.fill === undefined ? {} : { fill: style.fill }),
    textAnchor: style.textAnchor,
    ...(style.letterSpacing === undefined ? {} : { letterSpacing: style.letterSpacing }),
    rawAttributes: style.rawAttributes,
  };
}

function mapEngineClass(classification: EngineSvgClass): SvgClass {
  switch (classification) {
    case 'editable-placeholder':
      return 'price-editable';
    case 'already-replaced-editable-price':
      return 'price-already-set';
    case 'split-text-placeholder':
      return 'split-tspan';
    case 'price-as-path':
      return 'price-path-only';
    case 'price-absent':
      return 'price-absent';
    case 'unknown':
      return 'unknown';
  }
}

function indexesOf(source: string, needle: string): number[] {
  const indexes: number[] = [];
  let cursor = 0;
  while (cursor <= source.length - needle.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + needle.length;
  }
  return indexes;
}

function generatedRole(value: string | undefined): PriceRole | undefined {
  return value === 'NORMAL' || value === 'EMINENT' ? value : undefined;
}

export function analyzeSvg(svg: string): SvgAnalysisResult {
  const scan = scanSvgXml(svg);
  const diagnostics: Diagnostic[] = [];
  const targets: SvgPriceTargetAnalysis[] = [];
  const generatedTextRoles = new Set<PriceRole>();
  const generatedPathRoles = new Set<PriceRole>();

  for (const element of scan.elements) {
    if (element.attributes['data-precios-generated'] !== '1') continue;
    const role = generatedRole(element.attributes['data-precios-price-role']);
    if (role === undefined) continue;
    if (element.tag === 'path') generatedPathRoles.add(role);
    if (element.tag === 'text' || element.tag === 'tspan') generatedTextRoles.add(role);
  }

  const occurrencesByRole = new Map<PriceRole, number>([
    ['NORMAL', 0],
    ['EMINENT', 0],
  ]);

  for (const region of scan.textRegions) {
    for (const placeholder of PLACEHOLDERS) {
      for (const index of indexesOf(region.text, placeholder.literal)) {
        const occurrence = occurrencesByRole.get(placeholder.role) ?? 0;
        occurrencesByRole.set(placeholder.role, occurrence + 1);
        const ranges = rangesForOccurrence(region, index, placeholder.literal.length);
        const first = ranges[0];
        if (first === undefined) continue;
        const style = resolveTextStyle(first);
        const contractStyle = toContractStyle(style);
        const descriptor: SvgTargetDescriptor = {
          id: `${region.path}:${placeholder.role}:${occurrence}`,
          locator: { kind: 'placeholder', literal: placeholder.literal, occurrence },
          placeholder: { kind: placeholder.role, literal: placeholder.literal },
          ...(contractStyle === undefined ? {} : { style: contractStyle }),
        };
        targets.push({
          id: descriptor.id,
          role: placeholder.role,
          literal: placeholder.literal,
          split: ranges.length > 1 || new Set(ranges.map((range) => range.elementPath)).size > 1,
          occurrence,
          ranges,
          style,
          descriptor,
        });
      }
    }
  }

  const normalCount = occurrencesByRole.get('NORMAL') ?? 0;
  const eminentCount = occurrencesByRole.get('EMINENT') ?? 0;
  const hasGeneratedText = generatedTextRoles.size > 0;
  const hasGeneratedPath = generatedPathRoles.size > 0;
  let engineClassification: EngineSvgClass;

  if (hasGeneratedPath) {
    engineClassification = 'price-as-path';
    diagnostics.push({
      code: 'svg.price-path-explicit',
      message: 'Se detectó un precio vectorizado únicamente mediante metadata inequívoca del engine; no se habilita edición automática.',
    });
  } else if (hasGeneratedText) {
    if (normalCount !== 0 || eminentCount !== 0 || !generatedTextRoles.has('NORMAL') || !generatedTextRoles.has('EMINENT')) {
      engineClassification = 'unknown';
      diagnostics.push({
        code: 'svg.generated-price-ambiguous',
        message: 'La metadata de precio editable está incompleta o mezclada con placeholders; requiere revisión manual.',
      });
    } else {
      engineClassification = 'already-replaced-editable-price';
    }
  } else if (normalCount === 0 && eminentCount === 0) {
    engineClassification = 'price-absent';
  } else if (normalCount !== 1 || eminentCount !== 1) {
    engineClassification = 'unknown';
    diagnostics.push({
      code: 'svg.placeholder-ambiguous',
      message: 'Los placeholders de precio no aparecen exactamente una vez por rol; no se habilita edición automática.',
      details: { normalCount, eminentCount },
    });
  } else if (targets.some((target) => target.split)) {
    engineClassification = 'split-text-placeholder';
  } else {
    engineClassification = 'editable-placeholder';
  }

  for (const target of targets) {
    if (target.style.font === undefined || target.style.fontSize === undefined || target.style.x === undefined) {
      diagnostics.push({
        code: 'svg.target-style-incomplete',
        message: `El target ${target.role} no tiene todas las métricas inline necesarias para una sustitución segura.`,
        details: { targetId: target.id },
      });
    }
  }

  return {
    classification: mapEngineClass(engineClassification),
    engineClassification,
    targets,
    diagnostics,
  };
}
