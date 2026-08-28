import type { Diagnostic } from '../../domain/contracts/core';
import type { FilePreflight, PreflightIssue, PreflightSeverity } from '../../domain/contracts/preflight';
import type { FontResolution } from '../font-resolver/model';
import type { SvgEngineGenerationResult } from './engine';
import type { EngineSvgClass } from './model';

export interface SvgFilePreflightInput {
  readonly fileId: string;
  readonly fileName: string;
  readonly result: SvgEngineGenerationResult;
  readonly fonts?: readonly FontResolution[];
  readonly exportIssues?: readonly PreflightIssue[];
}

function classificationSeverity(classification: EngineSvgClass): PreflightSeverity {
  switch (classification) {
    case 'editable-placeholder':
    case 'split-text-placeholder':
    case 'price-absent':
      return 'OK';
    case 'already-replaced-editable-price':
      return 'WARNING';
    case 'price-as-path':
    case 'unknown':
      return 'ERROR';
  }
}

function diagnosticSeverity(diagnostic: Diagnostic): PreflightSeverity {
  switch (diagnostic.code) {
    case 'svg.price-path-explicit':
    case 'svg.generated-price-ambiguous':
    case 'svg.placeholder-ambiguous':
    case 'svg.target-style-incomplete':
    case 'svg.price-empty':
    case 'svg.metrics-incomplete':
    case 'svg.metrics-unavailable':
    case 'svg.price-overflow':
    case 'svg.integrity-failed':
    case 'svg.integrity-unavailable':
      return 'ERROR';
    default:
      return 'WARNING';
  }
}

function scopedIssue(
  issue: Omit<PreflightIssue, 'fileId' | 'fileName'>,
  fileId: string,
  fileName: string,
): PreflightIssue {
  return {
    ...issue,
    fileId,
    fileName,
  };
}

function diagnosticIssue(diagnostic: Diagnostic, fileId: string, fileName: string): PreflightIssue {
  return scopedIssue({
    severity: diagnosticSeverity(diagnostic),
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
  }, fileId, fileName);
}

function classificationIssue(input: SvgFilePreflightInput): PreflightIssue {
  const classification = input.result.analysis.engineClassification;
  return scopedIssue({
    severity: classificationSeverity(classification),
    code: `svg.classification.${classification}`,
    message: `Clasificación SVG: ${classification}.`,
    details: {
      classification,
      contractClassification: input.result.classification,
    },
  }, input.fileId, input.fileName);
}

function placeholderIssues(input: SvgFilePreflightInput): readonly PreflightIssue[] {
  return input.result.analysis.targets.map((target) => scopedIssue({
    severity: 'OK',
    code: `svg.placeholder.${target.role.toLowerCase()}`,
    message: `Placeholder ${target.role} detectado de forma explícita.`,
    details: {
      targetId: target.id,
      literal: target.literal,
      split: target.split,
      occurrence: target.occurrence,
    },
  }, input.fileId, input.fileName));
}

function overflowIssues(input: SvgFilePreflightInput): readonly PreflightIssue[] {
  return input.result.overflow.map((overflow, index) => {
    const severity: PreflightSeverity = overflow.status === 'overflow'
      ? 'ERROR'
      : overflow.status === 'unknown'
        ? 'WARNING'
        : 'OK';
    return scopedIssue({
      severity,
      code: `svg.overflow.${overflow.status}`,
      message: overflow.message ?? `Estado de overflow: ${overflow.status}.`,
      details: {
        index,
        measuredWidth: overflow.measuredWidth ?? null,
        availableWidth: overflow.availableWidth ?? null,
      },
    }, input.fileId, input.fileName);
  });
}

function integrityIssues(input: SvgFilePreflightInput): readonly PreflightIssue[] {
  const integrity = input.result.integrity;
  if (integrity === undefined) return [];
  return [scopedIssue({
    severity: integrity.ok ? 'OK' : 'ERROR',
    code: integrity.ok ? 'svg.integrity.ok' : 'svg.integrity.failed',
    message: integrity.ok
      ? 'La estructura protegida del SVG permanece íntegra.'
      : 'Se detectaron diferencias fuera de las regiones permitidas del SVG.',
    details: {
      unexpectedDifferences: integrity.unexpectedDifferences,
      allowedDifferenceCount: integrity.allowedDifferences.length,
    },
  }, input.fileId, input.fileName)];
}

function transformationIssues(input: SvgFilePreflightInput): readonly PreflightIssue[] {
  if (input.result.status === 'generated') {
    return [scopedIssue({
      severity: 'OK',
      code: 'svg.transformation.generated',
      message: 'La transformación SVG finalizó correctamente.',
    }, input.fileId, input.fileName)];
  }
  if (input.result.status === 'error') {
    return [scopedIssue({
      severity: 'ERROR',
      code: 'svg.transformation.error',
      message: 'La transformación SVG terminó con error para este archivo.',
    }, input.fileId, input.fileName)];
  }
  const classification = input.result.analysis.engineClassification;
  if (classification === 'editable-placeholder' || classification === 'split-text-placeholder') {
    return [scopedIssue({
      severity: 'ERROR',
      code: 'svg.transformation.result-missing',
      message: 'El SVG requiere reemplazo de precios pero no existe contenido procesado para preview/export.',
    }, input.fileId, input.fileName)];
  }
  return [];
}

function fontIssues(input: SvgFilePreflightInput): readonly PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  for (const resolution of input.fonts ?? []) {
    const baseDetails = {
      family: resolution.requested.family,
      subfamily: resolution.requested.subfamily ?? null,
      weight: resolution.requested.weight,
      style: resolution.requested.style,
    };
    if (resolution.status === 'resolved') {
      issues.push(scopedIssue({
        severity: 'OK',
        code: 'font.resolved',
        message: 'La fuente requerida está resuelta para este SVG.',
        details: baseDetails,
      }, input.fileId, input.fileName));
    } else {
      issues.push(scopedIssue({
        severity: 'ERROR',
        code: resolution.status === 'missing' ? 'font.missing' : 'font.variant-mismatch',
        message: resolution.status === 'missing'
          ? 'La fuente requerida no está disponible.'
          : 'La familia existe, pero la variante requerida no coincide.',
        details: baseDetails,
      }, input.fileId, input.fileName));
    }
    for (const diagnostic of resolution.diagnostics) {
      const severity: PreflightSeverity = resolution.status === 'resolved' ? 'WARNING' : 'ERROR';
      issues.push(scopedIssue({
        severity,
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
      }, input.fileId, input.fileName));
    }
  }
  return issues;
}

function dedupeIssues(issues: readonly PreflightIssue[]): readonly PreflightIssue[] {
  const seen = new Set<string>();
  const result: PreflightIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}\u0000${issue.code}\u0000${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

export function buildSvgFilePreflight(input: SvgFilePreflightInput): FilePreflight {
  const issues = dedupeIssues([
    classificationIssue(input),
    ...placeholderIssues(input),
    ...input.result.diagnostics.map((diagnostic) => diagnosticIssue(diagnostic, input.fileId, input.fileName)),
    ...fontIssues(input),
    ...overflowIssues(input),
    ...integrityIssues(input),
    ...transformationIssues(input),
    ...(input.exportIssues ?? []).map((issue) => scopedIssue({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      ...(issue.details === undefined ? {} : { details: issue.details }),
    }, input.fileId, input.fileName)),
  ]);
  return {
    fileId: input.fileId,
    fileName: input.fileName,
    blocking: issues.some((issue) => issue.severity === 'ERROR'),
    issues,
  };
}
