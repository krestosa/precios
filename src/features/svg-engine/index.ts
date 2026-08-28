export { analyzeSvg } from './analyze';
export { buildSvgPreviewModel, generateSvgPrices } from './engine';
export type { SvgEngineGenerationResult } from './engine';
export {
  applyRawPatch,
  auditRawPatchIntegrity,
  fingerprintSvgProtectedStructure,
  sha256Hex,
} from './integrity';
export { createBrowserTextMeasurer, measureOriginalPlaceholder, measurePriceUnit } from './measure';
export { buildSvgFilePreflight } from './preflight';
export type { SvgFilePreflightInput } from './preflight';
export type {
  EngineSvgClass,
  PriceDisplayValues,
  PriceRole,
  ProtectedFingerprints,
  RawPatchEdit,
  SvgAnalysisResult,
  SvgGenerationInput,
  SvgIntegrityAudit,
  SvgPreviewModel,
  SvgPreviewTarget,
  SvgPriceTargetAnalysis,
  TextMeasureRequest,
  TextMeasureResult,
  TextMeasurer,
  TextRunStyle,
} from './model';
