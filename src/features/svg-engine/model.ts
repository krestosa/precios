import type { Diagnostic } from '../../domain/contracts/core';
import type { FontSpec } from '../../domain/contracts/fonts';
import type { SlotBounds, SvgClass, SvgTargetDescriptor } from '../../domain/contracts/svg';

export type PriceRole = 'NORMAL' | 'EMINENT';

export type EngineSvgClass =
  | 'editable-placeholder'
  | 'already-replaced-editable-price'
  | 'split-text-placeholder'
  | 'price-as-path'
  | 'price-absent'
  | 'unknown';

export interface RawTextRange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly textRegionId: number;
  readonly elementPath: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly inheritedAttributes: Readonly<Record<string, string>>;
}

export interface TextRunStyle {
  readonly font?: FontSpec;
  readonly fontSize?: number;
  readonly letterSpacing?: string;
  readonly textAnchor: 'start' | 'middle' | 'end';
  readonly fill?: string;
  readonly x?: number;
  readonly y?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly transform?: string;
  readonly rawAttributes: Readonly<Record<string, string>>;
}

export interface SvgPriceTargetAnalysis {
  readonly id: string;
  readonly role: PriceRole;
  readonly literal: '$$$$' | '@@@@';
  readonly split: boolean;
  readonly occurrence: number;
  readonly ranges: readonly RawTextRange[];
  readonly style: TextRunStyle;
  readonly descriptor: SvgTargetDescriptor;
}

export interface SvgAnalysisResult {
  readonly classification: SvgClass;
  readonly engineClassification: EngineSvgClass;
  readonly targets: readonly SvgPriceTargetAnalysis[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface TextMeasureRequest {
  readonly text: string;
  readonly font: FontSpec;
  readonly fontSize: number;
  readonly letterSpacing?: string;
}

export interface TextMeasureResult {
  readonly status: 'measured' | 'unavailable';
  readonly width?: number;
  readonly method: 'canvas' | 'custom' | 'unavailable';
  readonly message?: string;
}

export interface TextMeasurer {
  readonly method: TextMeasureResult['method'];
  measure(request: TextMeasureRequest): TextMeasureResult;
}

export interface PriceDisplayValues {
  readonly normal: string;
  readonly eminent: string;
}

export interface SvgGenerationInput {
  readonly svg: string;
  readonly prices: PriceDisplayValues;
  readonly measurer: TextMeasurer;
  readonly slots?: Partial<Record<PriceRole, SlotBounds>>;
}

export interface RawPatchEdit {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
  readonly reason: string;
}

export interface ProtectedFingerprints {
  readonly protectedBytesSha256: string;
  readonly pathsSha256: string;
  readonly imagesSha256: string;
  readonly rootGeometrySha256: string;
  readonly defsSha256: string;
  readonly filtersSha256: string;
  readonly gradientsSha256: string;
  readonly patternsSha256: string;
}

export interface SvgIntegrityAudit {
  readonly ok: boolean;
  readonly original: ProtectedFingerprints;
  readonly result: ProtectedFingerprints;
  readonly allowedDifferences: readonly string[];
  readonly unexpectedDifferences: readonly string[];
}

export interface SvgPreviewTarget {
  readonly role: PriceRole;
  readonly id: string;
  readonly slot?: SlotBounds;
  readonly originalCenterX?: number;
  readonly measuredWidth?: number;
}

export interface SvgPreviewModel {
  readonly originalSvg: string;
  readonly resultSvg?: string;
  readonly classification: EngineSvgClass;
  readonly targets: readonly SvgPreviewTarget[];
  readonly diagnostics: readonly Diagnostic[];
}
