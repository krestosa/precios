export type { Diagnostic, JsonPrimitive, JsonValue } from './core';
export type {
  GoogleSheetsSource,
  LocalWorkbookSource,
  PriceSource,
  PriceSourceKind,
  SourceCell,
  SourceLoc,
  SourceMeta,
  SourceRow,
  SourceSnapshot,
  SourceStatus,
} from './source';
export type {
  AppliedRule,
  Channel,
  Discount25Status,
  Discount25Validation,
  PriceField,
  PricePair,
  PriceResolution,
  PricingRecord,
  ProductRef,
  ScopeRef,
  UnknownPriceReason,
  ValueProvenance,
} from './pricing';
export type {
  MatchCandidate,
  MatchMethod,
  MatchResult,
  SessionOverride,
} from './matching';
export type {
  FontFileMeta,
  FontRecord,
  FontSource,
  FontSpec,
} from './fonts';
export type {
  AllowedDifference,
  IntegrityDescriptor,
  IntegrityResult,
  OverflowResult,
  PricePlaceholder,
  SlotBounds,
  SvgClass,
  SvgGenerationResult,
  SvgLocator,
  SvgTargetDescriptor,
  TextStyleDescriptor,
} from './svg';
export type {
  BatchPreflight,
  FilePreflight,
  PreflightIssue,
  PreflightSeverity,
} from './preflight';
export type { DataSourceTrace, FileTrace } from './manifest';
export type {
  BatchExportResult,
  FileExportResult,
  FileExportStatus,
  ManifestArtifact,
  ManifestFormat,
} from './batch';
