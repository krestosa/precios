import type {
  BatchPreflight,
  Diagnostic,
  FilePreflight,
  MatchResult,
  PreflightIssue,
  PriceField,
} from '../domain/contracts';
import type { ReconciledPricingRecord } from '../domain/pricing/reconcile';
import type { PricingMatrixAdaptedRow } from '../features/data-source';
import type { SvgAnalysisResult, SvgEngineGenerationResult } from '../features/svg-engine';
import type { FontView, WorkbenchFileView, WorkbenchViewModel } from '../features/ui/models';
import type { PreciosAppCommandName } from '../features/ui/control-api/types';

export interface RuntimePriceAlternative {
  readonly id: string;
  readonly groupRaw: string | null;
  readonly channel: string;
  readonly normal: PriceField | null;
  readonly eminent: PriceField | null;
}

export interface RuntimeFile {
  readonly id: string;
  readonly fileName: string;
  readonly sourceSvg: string;
  readonly analysis: SvgAnalysisResult;
  match: MatchResult;
  generation?: SvgEngineGenerationResult;
  preflight?: FilePreflight;
  priceAlternatives: readonly ReconciledPricingRecord[];
  priceIssue?: PreflightIssue;
}

export interface RuntimeSource {
  readonly fileName: string;
  readonly rows: readonly PricingMatrixAdaptedRow[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface AppRuntimeSnapshot {
  readonly source: {
    readonly fileName: string;
    readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
    readonly products: readonly {
      readonly id: string;
      readonly code: string;
      readonly name: string;
      readonly prices: readonly {
        readonly tier: 'NORMAL' | 'EMINENT';
        readonly groupRaw: string;
        readonly channel: string;
        readonly state: string;
        readonly amount: number | null;
      }[];
    }[];
  } | null;
  readonly files: readonly {
    readonly id: string;
    readonly fileName: string;
    readonly classification: string;
    readonly engineClassification: string;
    readonly matchStatus: string;
    readonly pricing: readonly RuntimePriceAlternative[];
    readonly preflightBlocking: boolean | null;
    readonly generationStatus: string | null;
  }[];
  readonly exportResult: {
    readonly status: 'generated' | 'error';
    readonly kind: string;
    readonly hashAlgorithm: 'sha256';
    readonly sha256: string | null;
    readonly partial: boolean;
    readonly artifactNames: readonly string[];
    readonly message?: string;
  } | null;
  readonly preview: {
    readonly fileId: string;
    readonly command: string;
    readonly zoom: number;
  } | null;
}

export interface AppRuntimeController {
  snapshot(): AppRuntimeSnapshot;
  waitFor(command: PreciosAppCommandName): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export type MutableModel = {
  source: WorkbenchViewModel['source'];
  svgLoadStatus: WorkbenchViewModel['svgLoadStatus'];
  files: WorkbenchFileView[];
  fonts: FontView[];
  fontLoadStatus: WorkbenchViewModel['fontLoadStatus'];
  preflight?: BatchPreflight;
  progress?: WorkbenchViewModel['progress'];
};

export function emptyModel(): MutableModel {
  return {
    source: {
      status: 'empty',
      capabilities: { csv: true, xlsx: true, xls: true },
    },
    svgLoadStatus: 'empty',
    files: [],
    fonts: [],
    fontLoadStatus: 'empty',
  };
}

export function fileStem(fileName: string): string {
  return fileName.replace(/\.svg$/i, '').trim();
}

export function known(field: PriceField | undefined): field is Extract<PriceField, { readonly state: 'known' }> {
  return field?.state === 'known';
}

export function targetRequiresPrices(analysis: SvgAnalysisResult): boolean {
  return analysis.engineClassification === 'editable-placeholder' || analysis.engineClassification === 'split-text-placeholder';
}

export function preflightIssue(
  severity: PreflightIssue['severity'],
  code: string,
  message: string,
): PreflightIssue {
  return { severity, code, message };
}
