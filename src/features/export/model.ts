import type { FileExportResult, ManifestArtifact } from '../../domain/contracts/batch';
import type { JsonValue } from '../../domain/contracts/core';
import type { FileTrace } from '../../domain/contracts/manifest';
import type { FilePreflight } from '../../domain/contracts/preflight';

export interface ExportJobMetadata {
  readonly timestamp: string;
  readonly jobId?: string;
  readonly provenance?: JsonValue;
}

export interface ExportFileInput {
  readonly fileId: string;
  readonly sourceSvg: string;
  readonly resultSvg?: string;
  readonly outputName?: string;
  readonly trace: FileTrace;
  readonly preflight?: FilePreflight;
  readonly status?: 'exported' | 'skipped' | 'error';
}

export interface SvgExportArtifact {
  readonly fileName: string;
  readonly content: string;
  readonly sha256: string;
}

export interface ExportManifestFile {
  readonly fileId: string;
  readonly status: 'exported' | 'skipped' | 'error';
  readonly sourceFileName: string;
  readonly outputFileName: string | null;
  readonly local: FileTrace['local'];
  readonly match: FileTrace['match'];
  readonly pricing: {
    readonly normal: FileTrace['pricing']['normal'] | null;
    readonly eminent: FileTrace['pricing']['eminent'] | null;
    readonly appliedRule: FileTrace['pricing']['appliedRule'] | null;
    readonly exception: string | null;
  };
  readonly provenance: FileTrace['sources'];
  readonly font: FileTrace['font'] | null;
  readonly warnings: FileTrace['warnings'];
  readonly errors: FileTrace['errors'];
  readonly timestamp: string;
  readonly hashes: {
    readonly sourceSha256: string;
    readonly resultSha256: string | null;
  };
}

export interface ExportManifestDocument {
  readonly version: 1;
  readonly job: ExportJobMetadata;
  readonly files: readonly ExportManifestFile[];
}

export interface ExportBundleResult {
  readonly files: readonly FileExportResult[];
  readonly svgArtifacts: readonly SvgExportArtifact[];
  readonly manifests: readonly ManifestArtifact[];
  readonly manifestDocument: ExportManifestDocument;
  readonly zip: Uint8Array;
  readonly zipSha256: string;
  readonly partial: boolean;
}
