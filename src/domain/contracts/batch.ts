import type { FileTrace } from './manifest';
import type { PreflightIssue } from './preflight';

export type FileExportStatus = 'exported' | 'skipped' | 'error';

export interface FileExportResult {
  readonly fileId: string;
  readonly inputName: string;
  readonly status: FileExportStatus;
  readonly outputName?: string;
  readonly trace: FileTrace;
  readonly diagnostics: readonly PreflightIssue[];
}

export type ManifestFormat = 'json' | 'csv';

export interface ManifestArtifact {
  readonly format: ManifestFormat;
  readonly fileName: string;
  readonly content: string;
}

export interface BatchExportResult {
  readonly files: readonly FileExportResult[];
  readonly manifests: readonly ManifestArtifact[];
  readonly partial: boolean;
}
