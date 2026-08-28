export type MatchMethod =
  | 'canonical-exact'
  | 'exact-tokens'
  | 'unambiguous-partial'
  | 'fuzzy-suggestion'
  | 'manual';

export interface MatchCandidate {
  readonly id: string;
  readonly label: string;
  readonly canonical?: string;
  readonly method: MatchMethod;
  readonly confidence: number;
}

type AutoMatchMethod = Exclude<MatchMethod, 'fuzzy-suggestion' | 'manual'>;

export type MatchResult =
  | {
      readonly status: 'matched';
      readonly method: AutoMatchMethod | 'manual';
      readonly confidence: number;
      readonly selected: MatchCandidate;
      readonly candidates: readonly MatchCandidate[];
    }
  | {
      readonly status: 'suggestion';
      readonly method: 'fuzzy-suggestion';
      readonly confidence: number;
      readonly candidates: readonly MatchCandidate[];
    }
  | {
      readonly status: 'ambiguous';
      readonly candidates: readonly MatchCandidate[];
      readonly requiresHuman: true;
    }
  | {
      readonly status: 'unmatched';
      readonly candidates: readonly MatchCandidate[];
    };

export interface SessionOverride {
  readonly inputId: string;
  readonly candidateId: string;
  readonly sessionId: string;
  readonly selectedBy: 'human';
}
