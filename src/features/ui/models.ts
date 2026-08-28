import type {
  BatchPreflight,
  Channel,
  Discount25Validation,
  FilePreflight,
  FileTrace,
  FontRecord,
  MatchResult,
  PriceField,
  SvgClass,
  SvgGenerationResult,
} from '../../domain/contracts';

export type UiLoadStatus = 'empty' | 'loading' | 'ready' | 'error';
export type ProcessingState = 'queued' | 'processing' | 'ready' | 'warning' | 'error';
export type WorkbookSheetVisibility = 'visible' | 'hidden' | 'veryHidden';
export type SheetSupportStatus = 'unknown' | 'supported' | 'unsupported';
export type PreviewMode = 'original' | 'result' | 'overlay';
export type FontUiStatus = 'installed' | 'uploaded' | 'missing' | 'mismatch';
export type LayoutIssueKind = 'overflow' | 'alignment' | 'missing-font';

export interface SourceCapabilityView {
  readonly csv: boolean;
  readonly xlsx: boolean;
  readonly xls: boolean;
}

export interface WorkbookSheetView {
  readonly name: string;
  readonly index: number;
  readonly visibility: WorkbookSheetVisibility;
  readonly supportStatus?: SheetSupportStatus;
  readonly message?: string;
}

export interface WorkbookSheetSummaryView {
  readonly rowCount: number;
  readonly columnCount: number;
  readonly normalGroupCount: number;
  readonly eminentGroupCount?: number;
  readonly warnings?: readonly string[];
}

export interface PriceSourceView {
  readonly status: UiLoadStatus;
  readonly fileName?: string;
  readonly capabilities: SourceCapabilityView;
  readonly message?: string;
  readonly sheets?: readonly WorkbookSheetView[];
  readonly selectedSheetName?: string;
  readonly suggestedSheetName?: string;
  readonly sheetSelectionRequired?: boolean;
  readonly sheetProcessingState?: ProcessingState;
  readonly sheetMessage?: string;
  readonly selectedSheetSummary?: WorkbookSheetSummaryView;
}

export interface PreviewAsset {
  readonly kind: 'markup' | 'url';
  readonly value: string;
  readonly label?: string;
}

export interface PreviewView {
  readonly status: UiLoadStatus;
  readonly original?: PreviewAsset;
  readonly result?: PreviewAsset;
  readonly overlay?: PreviewAsset;
  readonly message?: string;
}

export interface LayoutIssueView {
  readonly id: string;
  readonly kind: LayoutIssueKind;
  readonly severity: 'WARNING' | 'ERROR';
  readonly message: string;
  readonly actionLabel: string;
}

export interface FontView {
  readonly id: string;
  readonly displayName: string;
  readonly processingState: ProcessingState;
  readonly message?: string;
  readonly record?: FontRecord;
  readonly uiStatus?: FontUiStatus;
  readonly requiredBy?: readonly string[];
}

export interface FilePriceView {
  readonly normal?: PriceField;
  readonly eminent?: PriceField;
  readonly discount25?: Discount25Validation;
}

export interface WorkbenchFileView {
  readonly id: string;
  readonly fileName: string;
  readonly processingState: ProcessingState;
  readonly processingMessage?: string;
  readonly selected?: boolean;
  readonly detectedLocal?: string;
  readonly match?: MatchResult;
  readonly classification?: SvgClass;
  readonly sourceFileName?: string;
  readonly rawGroup?: string | null;
  readonly channel?: Channel;
  readonly prices?: FilePriceView;
  readonly preflight?: FilePreflight;
  readonly generation?: SvgGenerationResult;
  readonly preview?: PreviewView;
  readonly layoutIssues?: readonly LayoutIssueView[];
  readonly trace?: FileTrace;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly exportable?: boolean;
}

export interface WorkbenchProgressView {
  readonly value: number;
  readonly max: number;
  readonly label: string;
}

export interface WorkbenchViewModel {
  readonly source: PriceSourceView;
  readonly svgLoadStatus: UiLoadStatus;
  readonly files: readonly WorkbenchFileView[];
  readonly fonts: readonly FontView[];
  readonly fontLoadStatus: UiLoadStatus;
  readonly preflight?: BatchPreflight;
  readonly progress?: WorkbenchProgressView;
}

export const EMPTY_WORKBENCH_MODEL: WorkbenchViewModel = {
  source: {
    status: 'empty',
    capabilities: { csv: true, xlsx: true, xls: false },
  },
  svgLoadStatus: 'empty',
  files: [],
  fonts: [],
  fontLoadStatus: 'empty',
};
