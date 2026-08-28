import type { Diagnostic } from '../../domain/contracts/core';
import type { FontFileMeta, FontRecord, FontSpec } from '../../domain/contracts/fonts';

export type FontResolutionStatus = 'resolved' | 'missing' | 'mismatch';

export interface FontUploadInput {
  readonly name: string;
  readonly mimeType?: string;
  readonly bytes: ArrayBuffer;
}

export interface InspectedFontUpload {
  readonly meta: FontFileMeta;
  readonly spec?: FontSpec;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FontResolution {
  readonly status: FontResolutionStatus;
  readonly requested: FontSpec;
  readonly record?: FontRecord;
  readonly diagnostics: readonly Diagnostic[];
}

export interface RegisteredUploadedFont {
  readonly id: string;
  readonly spec: FontSpec;
  readonly meta: FontFileMeta;
}

export interface FontResolverSnapshot {
  readonly required: readonly FontSpec[];
  readonly resolutions: readonly FontResolution[];
  readonly uploads: readonly RegisteredUploadedFont[];
}
