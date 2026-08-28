import type { JsonValue } from './core';

export type PreflightSeverity = 'OK' | 'WARNING' | 'ERROR';

export interface PreflightIssue {
  readonly severity: PreflightSeverity;
  readonly code: string;
  readonly message: string;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
}

export interface FilePreflight {
  readonly fileId: string;
  readonly fileName: string;
  readonly blocking: boolean;
  readonly issues: readonly PreflightIssue[];
}

export interface BatchPreflight {
  readonly files: readonly FilePreflight[];
  readonly issues?: readonly PreflightIssue[];
}
