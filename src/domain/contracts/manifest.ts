import type { FontSpec } from './fonts';
import type { MatchMethod } from './matching';
import type { AppliedRule, PriceField } from './pricing';
import type { PreflightIssue } from './preflight';
import type { PriceSourceKind, SourceLoc } from './source';

export interface DataSourceTrace {
  readonly id: string;
  readonly kind: PriceSourceKind;
  readonly locations: readonly SourceLoc[];
}

export interface FileTrace {
  readonly sourceSvg: {
    readonly id?: string;
    readonly fileName: string;
    readonly hash?: string;
  };
  readonly local: {
    readonly raw?: string;
    readonly canonical?: string;
  };
  readonly match: {
    readonly method?: MatchMethod;
    readonly confidence?: number;
    readonly selectedId?: string;
    readonly manualOverride?: boolean;
  };
  readonly pricing: {
    readonly normal?: PriceField;
    readonly eminent?: PriceField;
    readonly appliedRule?: AppliedRule;
    readonly exception?: string;
  };
  readonly sources: readonly DataSourceTrace[];
  readonly font?: FontSpec;
  readonly warnings: readonly PreflightIssue[];
  readonly errors: readonly PreflightIssue[];
  readonly stableId?: string;
  readonly hash?: string;
  // Metadata opcional; no debe intervenir en decisiones funcionales.
  readonly timestamp?: string;
}
