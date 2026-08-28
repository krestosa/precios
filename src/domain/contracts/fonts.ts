import type { Diagnostic } from './core';

export interface FontSpec {
  readonly family: string;
  readonly subfamily?: string;
  readonly weight: number;
  readonly style: string;
}

export type FontSource = 'system' | 'uploaded' | 'unavailable';

export interface FontFileMeta {
  readonly id: string;
  readonly originalName?: string;
  readonly size?: number;
  readonly mimeType?: string;
  readonly hash?: string;
  // El filename es sólo trazabilidad; la identidad debe salir de metadata parseada.
  readonly parsed?: FontSpec;
}

export interface FontRecord {
  readonly spec: FontSpec;
  readonly source: FontSource;
  readonly status: 'available' | 'unavailable' | 'invalid';
  readonly file?: FontFileMeta;
  readonly diagnostics: readonly Diagnostic[];
}
