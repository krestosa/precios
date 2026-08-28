import type { Diagnostic } from '../../domain/contracts/core';
import type { IntegrityResult, OverflowResult, SvgGenerationResult } from '../../domain/contracts/svg';
import { analyzeSvg } from './analyze';
import { applyRawPatch, auditRawPatchIntegrity } from './integrity';
import { measureOriginalPlaceholder, measurePriceUnit } from './measure';
import type {
  PriceRole,
  RawPatchEdit,
  SvgAnalysisResult,
  SvgGenerationInput,
  SvgIntegrityAudit,
  SvgPreviewModel,
  SvgPreviewTarget,
  SvgPriceTargetAnalysis,
} from './model';

export interface SvgEngineGenerationResult extends SvgGenerationResult {
  readonly analysis: SvgAnalysisResult;
  readonly integrityAudit?: SvgIntegrityAudit;
  readonly preview: SvgPreviewModel;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function numberAttribute(value: number): string {
  return value.toFixed(6).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

function anchorCenter(referenceX: number, width: number, anchor: 'start' | 'middle' | 'end'): number {
  if (anchor === 'middle') return referenceX;
  if (anchor === 'end') return referenceX - width / 2;
  return referenceX + width / 2;
}

function xForCenteredWidth(center: number, width: number, anchor: 'start' | 'middle' | 'end', dx: number): number {
  if (anchor === 'middle') return center - dx;
  if (anchor === 'end') return center + width / 2 - dx;
  return center - width / 2 - dx;
}

function displayValue(input: SvgGenerationInput, role: PriceRole): string {
  return role === 'NORMAL' ? input.prices.normal : input.prices.eminent;
}

function makeReplacementMarkup(target: SvgPriceTargetAnalysis, value: string, x: number, prefixSize: number): string {
  return `<tspan data-precios-generated="1" data-precios-price-role="${target.role}" x="${numberAttribute(x)}"><tspan font-size="${numberAttribute(prefixSize)}">$</tspan><tspan>${escapeXmlText(value)}</tspan></tspan>`;
}

function editsForTarget(target: SvgPriceTargetAnalysis, replacement: string): RawPatchEdit[] {
  const [first, ...rest] = target.ranges;
  if (first === undefined) return [];
  return [
    {
      start: first.start,
      end: first.end,
      replacement,
      reason: `precio-${target.role.toLowerCase()}-reemplazo`,
    },
    ...rest.map((range) => ({
      start: range.start,
      end: range.end,
      replacement: '',
      reason: `precio-${target.role.toLowerCase()}-fragmento`,
    })),
  ];
}

function contractIntegrity(audit: SvgIntegrityAudit): IntegrityResult {
  return {
    ok: audit.ok,
    allowedDifferences: audit.allowedDifferences.map((path) => ({
      path,
      reason: 'Mutación limitada al rango textual del precio.',
    })),
    unexpectedDifferences: audit.unexpectedDifferences,
  };
}

function previewTarget(
  target: SvgPriceTargetAnalysis,
  measuredWidth: number | undefined,
  originalCenterX: number | undefined,
  input: SvgGenerationInput,
): SvgPreviewTarget {
  const slot = input.slots?.[target.role];
  return {
    role: target.role,
    id: target.id,
    ...(slot === undefined ? {} : { slot }),
    ...(originalCenterX === undefined ? {} : { originalCenterX }),
    ...(measuredWidth === undefined ? {} : { measuredWidth }),
  };
}

export async function generateSvgPrices(input: SvgGenerationInput): Promise<SvgEngineGenerationResult> {
  const analysis = analyzeSvg(input.svg);
  const diagnostics: Diagnostic[] = [...analysis.diagnostics];
  const overflow: OverflowResult[] = [];
  const edits: RawPatchEdit[] = [];
  const previewTargets: SvgPreviewTarget[] = [];

  if (analysis.classification !== 'price-editable' && analysis.classification !== 'split-tspan') {
    const preview: SvgPreviewModel = {
      originalSvg: input.svg,
      classification: analysis.engineClassification,
      targets: [],
      diagnostics,
    };
    return {
      status: 'skipped',
      classification: analysis.classification,
      targets: analysis.targets.map((target) => target.descriptor),
      overflow,
      diagnostics,
      analysis,
      preview,
    };
  }

  for (const target of analysis.targets) {
    const style = target.style;
    const value = displayValue(input, target.role);
    if (value === '') {
      diagnostics.push({
        code: 'svg.price-empty',
        message: `El precio ${target.role} está vacío; no se genera el SVG.`,
        details: { targetId: target.id },
      });
      continue;
    }
    if (style.font === undefined || style.fontSize === undefined || style.x === undefined) {
      diagnostics.push({
        code: 'svg.metrics-incomplete',
        message: `No hay métricas suficientes para alinear el precio ${target.role}.`,
        details: { targetId: target.id },
      });
      continue;
    }

    const originalMeasure = measureOriginalPlaceholder(style, target.literal, input.measurer);
    const resultMeasure = measurePriceUnit(value, style, input.measurer);
    if (
      originalMeasure.status !== 'measured'
      || originalMeasure.width === undefined
      || resultMeasure.status !== 'measured'
      || resultMeasure.width === undefined
      || resultMeasure.prefixSize === undefined
    ) {
      diagnostics.push({
        code: 'svg.metrics-unavailable',
        message: `No se pudo medir con precisión el precio ${target.role}; no se aplicó sustitución.`,
        details: {
          targetId: target.id,
          originalMethod: originalMeasure.method,
          resultMethod: resultMeasure.method,
        },
      });
      const metricMessage = resultMeasure.message ?? originalMeasure.message;
      overflow.push({
        status: 'unknown',
        ...(metricMessage === undefined ? {} : { message: metricMessage }),
      });
      previewTargets.push(previewTarget(target, undefined, undefined, input));
      continue;
    }

    const dx = style.dx ?? 0;
    const originalReferenceX = style.x + dx;
    const center = anchorCenter(originalReferenceX, originalMeasure.width, style.textAnchor);
    const replacementX = xForCenteredWidth(center, resultMeasure.width, style.textAnchor, dx);
    const replacement = makeReplacementMarkup(target, value, replacementX, resultMeasure.prefixSize);
    edits.push(...editsForTarget(target, replacement));

    const slot = input.slots?.[target.role];
    if (slot === undefined) {
      overflow.push({
        status: 'unknown',
        measuredWidth: resultMeasure.width,
        message: 'No se recibió un ancho de slot seguro; el engine no lo infiere por proximidad.',
      });
    } else if (resultMeasure.width > slot.width) {
      overflow.push({
        status: 'overflow',
        measuredWidth: resultMeasure.width,
        availableWidth: slot.width,
        message: `El precio ${target.role} excede el ancho disponible.`,
      });
      diagnostics.push({
        code: 'svg.price-overflow',
        message: `El precio ${target.role} desborda su slot; no se reduce automáticamente.`,
        details: { measuredWidth: resultMeasure.width, availableWidth: slot.width },
      });
    } else {
      overflow.push({
        status: 'fits',
        measuredWidth: resultMeasure.width,
        availableWidth: slot.width,
      });
    }

    previewTargets.push(previewTarget(target, resultMeasure.width, center, input));
  }

  const hasBlockingDiagnostic = diagnostics.some((item) =>
    item.code === 'svg.metrics-incomplete'
    || item.code === 'svg.metrics-unavailable'
    || item.code === 'svg.price-empty');

  if (edits.length === 0 || hasBlockingDiagnostic) {
    const preview: SvgPreviewModel = {
      originalSvg: input.svg,
      classification: analysis.engineClassification,
      targets: previewTargets,
      diagnostics,
    };
    return {
      status: 'error',
      classification: analysis.classification,
      targets: analysis.targets.map((target) => target.descriptor),
      overflow,
      diagnostics,
      analysis,
      preview,
    };
  }

  const patch = applyRawPatch(input.svg, edits);
  try {
    const integrityAudit = await auditRawPatchIntegrity(input.svg, patch);
    if (!integrityAudit.ok) {
      diagnostics.push({
        code: 'svg.integrity-failed',
        message: 'La validación de integridad detectó cambios fuera de las regiones permitidas.',
        details: { differences: integrityAudit.unexpectedDifferences },
      });
    }
    const preview: SvgPreviewModel = {
      originalSvg: input.svg,
      resultSvg: patch.svg,
      classification: analysis.engineClassification,
      targets: previewTargets,
      diagnostics,
    };
    return {
      status: integrityAudit.ok ? 'generated' : 'error',
      classification: analysis.classification,
      svg: patch.svg,
      targets: analysis.targets.map((target) => target.descriptor),
      overflow,
      integrity: contractIntegrity(integrityAudit),
      diagnostics,
      analysis,
      integrityAudit,
      preview,
    };
  } catch (error) {
    diagnostics.push({
      code: 'svg.integrity-unavailable',
      message: 'No fue posible calcular los hashes de integridad.',
      details: { reason: error instanceof Error ? error.message : String(error) },
    });
    const preview: SvgPreviewModel = {
      originalSvg: input.svg,
      classification: analysis.engineClassification,
      targets: previewTargets,
      diagnostics,
    };
    return {
      status: 'error',
      classification: analysis.classification,
      targets: analysis.targets.map((target) => target.descriptor),
      overflow,
      diagnostics,
      analysis,
      preview,
    };
  }
}

export function buildSvgPreviewModel(svg: string): SvgPreviewModel {
  const analysis = analyzeSvg(svg);
  return {
    originalSvg: svg,
    classification: analysis.engineClassification,
    targets: analysis.targets.map((target) => ({ role: target.role, id: target.id })),
    diagnostics: analysis.diagnostics,
  };
}
