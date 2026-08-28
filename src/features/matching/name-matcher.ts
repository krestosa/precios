import type { MatchCandidate, MatchMethod, MatchResult } from '../../domain/contracts/matching';
import {
  canonicalTokenSignature,
  canonicalTokens,
  normalizeCanonicalText,
} from '../../utils/normalize/text';

export interface MatchTarget {
  readonly id: string;
  readonly label: string;
}

export interface NameMatcherOptions {
  readonly fuzzySuggestionThreshold?: number;
  readonly fuzzyCandidateFloor?: number;
  readonly maxCandidates?: number;
}

const DEFAULT_FUZZY_THRESHOLD = 0.62;
const DEFAULT_FUZZY_FLOOR = 0.35;
const DEFAULT_MAX_CANDIDATES = 5;

function candidate(
  target: MatchTarget,
  method: MatchMethod,
  confidence: number,
): MatchCandidate {
  return {
    id: target.id,
    label: target.label,
    canonical: normalizeCanonicalText(target.label),
    method,
    confidence,
  };
}

function ambiguous(candidates: readonly MatchCandidate[]): MatchResult {
  return {
    status: 'ambiguous',
    candidates,
    requiresHuman: true,
  };
}

function matched(selected: MatchCandidate, candidates: readonly MatchCandidate[]): MatchResult {
  if (selected.method === 'fuzzy-suggestion') {
    return {
      status: 'suggestion',
      method: 'fuzzy-suggestion',
      confidence: selected.confidence,
      candidates,
    };
  }

  return {
    status: 'matched',
    method: selected.method,
    confidence: selected.confidence,
    selected,
    candidates,
  };
}

function tokenSubset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || left.length >= right.length) {
    return false;
  }

  const rightSet = new Set(right);
  if (!left.every((token) => rightSet.has(token))) {
    return false;
  }

  return left.length > 1 || left[0]!.length >= 4;
}

function isUnambiguousPartial(input: string, label: string): boolean {
  const inputTokens = canonicalTokens(input);
  const labelTokens = canonicalTokens(label);
  return tokenSubset(inputTokens, labelTokens) || tokenSubset(labelTokens, inputTokens);
}

function bigrams(value: string): readonly string[] {
  if (value.length < 2) {
    return value.length === 0 ? [] : [value];
  }

  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const pair of rightPairs) {
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (const pair of leftPairs) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(pair, count - 1);
    }
  }

  return (2 * intersection) / (leftPairs.length + rightPairs.length);
}

function tokenJaccard(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function fuzzyScore(input: string, label: string): number {
  const inputCanonical = normalizeCanonicalText(input);
  const labelCanonical = normalizeCanonicalText(label);
  const characterScore = diceCoefficient(inputCanonical, labelCanonical);
  const tokenScore = tokenJaccard(canonicalTokens(input), canonicalTokens(label));
  return Math.max(0, Math.min(1, characterScore * 0.65 + tokenScore * 0.35));
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  if (left.label !== right.label) {
    return left.label < right.label ? -1 : 1;
  }

  return left.id < right.id ? -1 : left.id === right.id ? 0 : 1;
}

export function matchName(
  input: string,
  targets: readonly MatchTarget[],
  options: NameMatcherOptions = {},
): MatchResult {
  const canonicalInput = normalizeCanonicalText(input);
  if (canonicalInput.length === 0 || targets.length === 0) {
    return { status: 'unmatched', candidates: [] };
  }

  const canonicalExact = targets
    .filter((target) => normalizeCanonicalText(target.label) === canonicalInput)
    .map((target) => candidate(target, 'canonical-exact', 1));

  if (canonicalExact.length === 1) {
    return matched(canonicalExact[0]!, canonicalExact);
  }
  if (canonicalExact.length > 1) {
    return ambiguous(canonicalExact);
  }

  const inputTokenSignature = canonicalTokenSignature(input);
  const exactTokens = targets
    .filter((target) => canonicalTokenSignature(target.label) === inputTokenSignature)
    .map((target) => candidate(target, 'exact-tokens', 0.98));

  if (exactTokens.length === 1) {
    return matched(exactTokens[0]!, exactTokens);
  }
  if (exactTokens.length > 1) {
    return ambiguous(exactTokens);
  }

  const partial = targets
    .filter((target) => isUnambiguousPartial(input, target.label))
    .map((target) => candidate(target, 'unambiguous-partial', 0.9));

  if (partial.length === 1) {
    return matched(partial[0]!, partial);
  }
  if (partial.length > 1) {
    return ambiguous(partial);
  }

  const threshold = Math.max(0, Math.min(1, options.fuzzySuggestionThreshold ?? DEFAULT_FUZZY_THRESHOLD));
  const floor = Math.max(0, Math.min(threshold, options.fuzzyCandidateFloor ?? DEFAULT_FUZZY_FLOOR));
  const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES));
  const fuzzyCandidates = targets
    .map((target) => candidate(target, 'fuzzy-suggestion', fuzzyScore(input, target.label)))
    .filter((item) => item.confidence >= floor)
    .sort(compareCandidates)
    .slice(0, maxCandidates);

  const best = fuzzyCandidates[0];
  if (best !== undefined && best.confidence >= threshold) {
    return {
      status: 'suggestion',
      method: 'fuzzy-suggestion',
      confidence: best.confidence,
      candidates: fuzzyCandidates,
    };
  }

  return { status: 'unmatched', candidates: fuzzyCandidates };
}
