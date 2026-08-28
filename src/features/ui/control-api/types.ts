import type { ExportKind, ManifestUiFormat, MatchApplyScope } from '../events';
import type { PreviewMode, SourceCapabilityView, UiLoadStatus } from '../models';

export const PRECIOS_APP_CONTROL_VERSION = '1.0' as const;

export const PRECIOS_APP_CONTROL_EVENTS = {
  ready: 'precios-app:v1:ready',
  command: 'precios-app:v1:command',
  result: 'precios-app:v1:result',
  stateChange: 'precios-app:v1:state-change',
  error: 'precios-app:v1:error',
} as const;

export type PreciosAppCommandName =
  | 'state.get'
  | 'flow.reset'
  | 'source.load'
  | 'svg.load'
  | 'font.load'
  | 'file.select'
  | 'matching.choose'
  | 'matching.apply'
  | 'preflight.run'
  | 'preview.setMode'
  | 'preview.fit'
  | 'preview.zoomIn'
  | 'preview.zoomOut'
  | 'preview.reset'
  | 'issue.run'
  | 'export.request';

export interface PreciosAppCommandDescriptor {
  readonly name: PreciosAppCommandName;
  readonly payload:
    | 'none'
    | 'files'
    | 'file-id'
    | 'match-choice'
    | 'match-apply'
    | 'preview-mode'
    | 'preview-target'
    | 'issue-action'
    | 'export-request';
}

export interface FilesCommandPayload {
  readonly files: File | readonly File[];
}

export interface FileSelectCommandPayload {
  readonly fileId: string;
}

export interface MatchChoiceCommandPayload {
  readonly fileId: string;
  readonly candidateId: string;
}

export interface MatchApplyCommandPayload extends MatchChoiceCommandPayload {
  readonly scope: MatchApplyScope;
}

export interface PreviewModeCommandPayload {
  readonly mode: PreviewMode;
}

export interface PreviewTargetCommandPayload {
  readonly fileId?: string;
}

export interface IssueActionCommandPayload {
  readonly fileId: string;
  readonly issueId: string;
  readonly kind: 'overflow' | 'alignment' | 'missing-font';
}

export interface ExportRequestCommandPayload {
  readonly kind: ExportKind;
  readonly fileIds?: readonly string[];
  readonly manifestFormat?: ManifestUiFormat;
}

export interface PreciosAppCommandPayloadMap {
  readonly 'state.get': undefined;
  readonly 'flow.reset': undefined;
  readonly 'source.load': FilesCommandPayload;
  readonly 'svg.load': FilesCommandPayload;
  readonly 'font.load': FilesCommandPayload;
  readonly 'file.select': FileSelectCommandPayload;
  readonly 'matching.choose': MatchChoiceCommandPayload;
  readonly 'matching.apply': MatchApplyCommandPayload;
  readonly 'preflight.run': undefined;
  readonly 'preview.setMode': PreviewModeCommandPayload;
  readonly 'preview.fit': PreviewTargetCommandPayload | undefined;
  readonly 'preview.zoomIn': PreviewTargetCommandPayload | undefined;
  readonly 'preview.zoomOut': PreviewTargetCommandPayload | undefined;
  readonly 'preview.reset': PreviewTargetCommandPayload | undefined;
  readonly 'issue.run': IssueActionCommandPayload;
  readonly 'export.request': ExportRequestCommandPayload;
}

export type PreciosAppControlErrorCode =
  | 'unknown-command'
  | 'invalid-payload'
  | 'not-ready'
  | 'not-found'
  | 'not-available'
  | 'internal-error';

export interface PreciosAppControlError {
  readonly code: PreciosAppControlErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export type PreciosAppControlResult<T = unknown> =
  | { readonly ok: true; readonly value?: T }
  | { readonly ok: false; readonly error: PreciosAppControlError };

export interface PreciosAppStateSnapshot {
  readonly contractVersion: typeof PRECIOS_APP_CONTROL_VERSION;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly source: {
    readonly status: UiLoadStatus;
    readonly fileName: string | null;
    readonly capabilities: SourceCapabilityView;
  };
  readonly counts: {
    readonly priceSources: number;
    readonly svgFiles: number;
    readonly fonts: number;
    readonly exportableFiles: number;
  };
  readonly loads: {
    readonly svgStatus: UiLoadStatus;
    readonly fontStatus: UiLoadStatus;
  };
  readonly view: {
    readonly selectedFileId: string | null;
    readonly selectedFileName: string | null;
    readonly detailsOpen: boolean;
    readonly previewMode: PreviewMode;
    readonly zoom: number;
    readonly matchChoiceByFile: Readonly<Record<string, string>>;
  };
  readonly matching: {
    readonly status: 'matched' | 'suggestion' | 'ambiguous' | 'unmatched';
    readonly method: string | null;
    readonly confidence: number | null;
    readonly candidateCount: number;
    readonly selectedCandidateId: string | null;
    readonly requiresHuman: boolean;
  } | null;
  readonly preflight: {
    readonly fileCount: number;
    readonly blockingFiles: number;
    readonly warnings: number;
    readonly errors: number;
  } | null;
  readonly generation: {
    readonly status: 'generated' | 'skipped' | 'error';
    readonly classification: string;
    readonly diagnostics: number;
    readonly overflowChecks: number;
  } | null;
  readonly export: {
    readonly exportableCount: number;
    readonly nonExportableCount: number;
    readonly selectedFileExportable: boolean | null;
  };
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly commands: readonly PreciosAppCommandName[];
}

export interface PreciosAppDiagnostics {
  readonly contractVersion: typeof PRECIOS_APP_CONTROL_VERSION;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly selectedFileId: string | null;
  readonly sourceStatus: UiLoadStatus;
  readonly svgStatus: UiLoadStatus;
  readonly fontStatus: UiLoadStatus;
  readonly svgFiles: number;
  readonly fonts: number;
  readonly exportableFiles: number;
  readonly previewMode: PreviewMode;
  readonly zoom: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly commands: readonly PreciosAppCommandName[];
}

export type PreciosAppStateListener = (state: PreciosAppStateSnapshot) => void;

export interface PreciosAppControlApi {
  readonly version: typeof PRECIOS_APP_CONTROL_VERSION;
  listCommands(): readonly PreciosAppCommandDescriptor[];
  getState(): PreciosAppStateSnapshot;
  getDiagnostics(): PreciosAppDiagnostics;
  execute(
    command: PreciosAppCommandName,
    payload?: PreciosAppCommandPayloadMap[PreciosAppCommandName],
  ): Promise<PreciosAppControlResult>;
  subscribe(listener: PreciosAppStateListener): () => void;
}

export interface PreciosAppCommandEventDetail {
  readonly requestId: string;
  readonly command: string;
  readonly payload?: unknown;
}

export interface PreciosAppResultEventDetail {
  readonly requestId: string;
  readonly command: string;
  readonly result: PreciosAppControlResult;
}

export interface PreciosAppErrorEventDetail {
  readonly requestId: string;
  readonly command: string;
  readonly error: PreciosAppControlError;
}

export interface PreciosAppReadyEventDetail {
  readonly version: typeof PRECIOS_APP_CONTROL_VERSION;
  readonly commands: readonly PreciosAppCommandDescriptor[];
}

export interface PreciosAppStateChangeEventDetail {
  readonly version: typeof PRECIOS_APP_CONTROL_VERSION;
  readonly state: PreciosAppStateSnapshot;
}

declare global {
  interface Window {
    preciosApp?: PreciosAppControlApi;
  }

  interface WindowEventMap {
    'precios-app:v1:ready': CustomEvent<PreciosAppReadyEventDetail>;
    'precios-app:v1:command': CustomEvent<PreciosAppCommandEventDetail>;
    'precios-app:v1:result': CustomEvent<PreciosAppResultEventDetail>;
    'precios-app:v1:state-change': CustomEvent<PreciosAppStateChangeEventDetail>;
    'precios-app:v1:error': CustomEvent<PreciosAppErrorEventDetail>;
  }
}
