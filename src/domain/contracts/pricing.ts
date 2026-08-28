import type { Diagnostic } from './core';
import type { PriceSourceKind, SourceLoc } from './source';

export type Channel = 'SALON' | 'DELI';

export interface ProductRef {
  readonly codeRaw: string;
  readonly nameRaw: string;
}

export interface ScopeRef {
  readonly groupRaw?: string | null;
  readonly localRaw?: string | null;
  readonly group?: string;
  readonly local?: string;
}

export interface ValueProvenance {
  readonly sourceId: string;
  readonly sourceKind: PriceSourceKind;
  readonly loc?: SourceLoc;
  readonly raw?: string | number | null;
}

export type UnknownPriceReason = 'empty' | 'missing' | 'invalid' | 'unresolved';

export type PriceField =
  | {
      readonly state: 'known';
      readonly amount: number;
      readonly provenance: ValueProvenance;
    }
  | {
      readonly state: 'unknown';
      readonly reason: UnknownPriceReason;
      readonly provenance?: ValueProvenance;
    };

export interface PricePair {
  readonly normal?: PriceField;
  readonly eminent?: PriceField;
}

export interface PricingRecord {
  readonly id: string;
  readonly product: ProductRef;
  readonly scope: ScopeRef;
  readonly channel: Channel;
  readonly prices: PricePair;
}

export type Discount25Status = 'not-checked' | 'valid' | 'mismatch' | 'not-applicable';

export interface Discount25Validation {
  readonly status: Discount25Status;
  readonly expectedEminent?: number;
  readonly difference?: number;
  readonly message?: string;
}

export interface AppliedRule {
  readonly id: string;
  readonly explanation: string;
  readonly recordIds?: readonly string[];
}

export interface PriceResolution {
  readonly status: 'resolved' | 'partial' | 'unresolved';
  readonly normal?: PriceField;
  readonly eminent?: PriceField;
  readonly appliedRule?: AppliedRule;
  readonly diagnostics?: readonly Diagnostic[];
}
