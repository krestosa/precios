import type { FontSpec } from '../../domain/contracts/fonts';
import type { SvgAnalysisResult } from '../svg-engine/model';

function keyOf(spec: FontSpec): string {
  return [
    spec.family.trim().toLocaleLowerCase('en-US'),
    spec.subfamily?.trim().toLocaleLowerCase('en-US') ?? '',
    String(spec.weight),
    spec.style.trim().toLocaleLowerCase('en-US'),
  ].join('\u0000');
}

export function requiredFontsFromSvgAnalyses(analyses: readonly SvgAnalysisResult[]): readonly FontSpec[] {
  const required = new Map<string, FontSpec>();
  for (const analysis of analyses) {
    for (const target of analysis.targets) {
      const font = target.style.font;
      if (font !== undefined) required.set(keyOf(font), font);
    }
  }
  return [...required.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, spec]) => spec);
}
