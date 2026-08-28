import type { Diagnostic } from './core';

export type PriceSourceKind = 'local-workbook' | 'google-sheets';

export interface SourceLoc {
  readonly sheet?: string;
  readonly row?: number;
  readonly column?: string | number;
  readonly cell?: string;
  readonly recordId?: string;
}

export interface SourceMeta {
  readonly id: string;
  readonly label?: string;
  readonly origin?: string;
  readonly sheet?: string;
}

export interface SourceCell {
  readonly key: string;
  readonly value: string | number | boolean | null;
  readonly loc: SourceLoc;
}

export interface SourceRow {
  readonly row: number;
  readonly cells: readonly SourceCell[];
}

export interface PriceSource {
  readonly kind: PriceSourceKind;
  readonly meta: SourceMeta;
}

export interface LocalWorkbookSource extends PriceSource {
  readonly kind: 'local-workbook';
  readonly fileId?: string;
}

export interface GoogleSheetsSource extends PriceSource {
  readonly kind: 'google-sheets';
  readonly spreadsheetId?: string;
  readonly range?: string;
}

export type SourceStatus = 'ready' | 'partial' | 'unavailable' | 'error';

export interface SourceSnapshot extends PriceSource {
  readonly status: SourceStatus;
  readonly rows: readonly SourceRow[];
  readonly diagnostics: readonly Diagnostic[];
}
