import type { MatchCandidate, MatchResult } from '../../domain/contracts/matching';
import { canonicalTokens, normalizeCanonicalText } from '../../utils/normalize/text';
import { matchName, type MatchTarget, type NameMatcherOptions } from './name-matcher';

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  cero: '0',
  un: '1',
  uno: '1',
  una: '1',
  dos: '2',
  tres: '3',
  cuatro: '4',
  cinco: '5',
  seis: '6',
  siete: '7',
  ocho: '8',
  nueve: '9',
  diez: '10',
  once: '11',
  doce: '12',
  trece: '13',
  catorce: '14',
  quince: '15',
  dieciseis: '16',
  diecisiete: '17',
  dieciocho: '18',
  diecinueve: '19',
  veinte: '20',
};

const DEFAULT_FORMATS: readonly SvgFormatDefinition[] = [
  { format: 'feed', aliases: ['feed'] },
  { format: 'story', aliases: ['story'] },
  { format: 'mailing', aliases: ['mailing'] },
  { format: 'reel', aliases: ['reel', 'reels'] },
  { format: 'post', aliases: ['post'] },
  { format: 'banner', aliases: ['banner'] },
];

const DISPLAY_SEPARATORS = /[\p{P}\p{S}]+/gu;
const WHITESPACE = /\s+/gu;
const INTEGER_TOKEN = /^\d+$/u;

export interface SvgFormatDefinition {
  readonly format: string;
  readonly aliases: readonly string[];
}

export interface SvgLocalHintTarget {
  readonly id?: string;
  readonly label: string;
}

export type SvgLocalHintPosition = 'prefix' | 'suffix';

export interface SvgLocalHint {
  readonly id?: string;
  readonly label: string;
  readonly raw: string;
  readonly canonical: string;
  readonly position: SvgLocalHintPosition;
}

export interface SvgIdentityLocalCandidate extends SvgLocalHint {
  readonly tokenCount: number;
}

export interface SvgIdentityParseOptions {
  readonly formats?: readonly SvgFormatDefinition[];
}

export interface SvgIdentity {
  readonly status: 'parsed' | 'unknown';
  readonly originalFilename: string;
  readonly baseName: string;
  readonly stem: string;
  readonly actionName: string | null;
  readonly actionCanonical: string | null;
  readonly format: string | null;
  readonly pieceIndex: number | null;
  readonly localHint: SvgLocalHint | null;
  readonly localCandidates: readonly SvgIdentityLocalCandidate[];
}

interface DetectedFormat {
  readonly format: string;
  readonly formatTokenIndex: number;
  readonly pieceIndex: number | null;
}

function basename(value: string): string {
  const parts = value.split(/[\\/]/u);
  return parts[parts.length - 1] ?? value;
}

function stripSvgExtension(value: string): string {
  return value.replace(/\.svg$/iu, '');
}

function displayTokens(stem: string): readonly string[] {
  const cleaned = stem
    .normalize('NFC')
    .replace(DISPLAY_SEPARATORS, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
  return cleaned.length === 0 ? [] : cleaned.split(' ');
}

function canonicalToken(value: string): string {
  return normalizeCanonicalText(value);
}

export function normalizeActionName(value: string): string {
  return canonicalTokens(value)
    .map((token) => NUMBER_WORDS[token] ?? token)
    .join(' ');
}

function formatAliasMap(definitions: readonly SvgFormatDefinition[]): ReadonlyMap<string, readonly string[]> {
  const aliases = new Map<string, string[]>();

  for (const definition of definitions) {
    const format = normalizeCanonicalText(definition.format);
    if (format.length === 0) continue;

    for (const aliasRaw of definition.aliases) {
      const alias = normalizeCanonicalText(aliasRaw);
      if (alias.length === 0 || alias.includes(' ')) continue;
      const formats = aliases.get(alias) ?? [];
      if (!formats.includes(format)) formats.push(format);
      aliases.set(alias, formats);
    }
  }

  return aliases;
}

function uniqueFormat(aliasMap: ReadonlyMap<string, readonly string[]>, token: string): string | null {
  const formats = aliasMap.get(token);
  return formats?.length === 1 ? formats[0]! : null;
}

function detectFormat(
  tokens: readonly string[],
  definitions: readonly SvgFormatDefinition[],
): DetectedFormat | null {
  if (tokens.length < 2) return null;

  const canonical = tokens.map(canonicalToken);
  const aliases = formatAliasMap(definitions);
  const lastIndex = canonical.length - 1;
  const last = canonical[lastIndex]!;

  if (INTEGER_TOKEN.test(last) && lastIndex >= 1) {
    const format = uniqueFormat(aliases, canonical[lastIndex - 1]!);
    if (format !== null && lastIndex - 1 > 0) {
      const pieceIndex = Number.parseInt(last, 10);
      if (Number.isSafeInteger(pieceIndex)) {
        return { format, formatTokenIndex: lastIndex - 1, pieceIndex };
      }
    }
  }

  const format = uniqueFormat(aliases, last);
  if (format !== null && lastIndex > 0) {
    return { format, formatTokenIndex: lastIndex, pieceIndex: null };
  }

  return null;
}

function tokensEqualAt(
  source: readonly string[],
  target: readonly string[],
  start: number,
): boolean {
  if (start < 0 || start + target.length > source.length) return false;
  return target.every((token, index) => source[start + index] === token);
}

export function findSvgLocalCandidates(
  identity: SvgIdentity,
  localHints: readonly SvgLocalHintTarget[],
): readonly SvgIdentityLocalCandidate[] {
  if (identity.actionName === null) return [];

  const tokens = displayTokens(identity.actionName);
  const canonicalSource = tokens.map(canonicalToken);
  const candidates: SvgIdentityLocalCandidate[] = [];

  for (const target of localHints) {
    const targetTokens = canonicalTokens(target.label);
    if (targetTokens.length === 0 || targetTokens.length >= canonicalSource.length) continue;

    const positions: readonly SvgLocalHintPosition[] = ['prefix', 'suffix'];
    for (const position of positions) {
      const start = position === 'prefix' ? 0 : canonicalSource.length - targetTokens.length;
      if (!tokensEqualAt(canonicalSource, targetTokens, start)) continue;

      const raw = tokens.slice(start, start + targetTokens.length).join(' ');
      candidates.push({
        ...(target.id === undefined ? {} : { id: target.id }),
        label: target.label,
        raw,
        canonical: normalizeCanonicalText(target.label),
        position,
        tokenCount: targetTokens.length,
      });
    }
  }

  return candidates;
}

export function actionNameWithoutLocal(
  identity: SvgIdentity,
  local: SvgIdentityLocalCandidate,
): string | null {
  if (identity.actionName === null) return null;
  const tokens = displayTokens(identity.actionName);
  const remaining = local.position === 'prefix'
    ? tokens.slice(local.tokenCount)
    : tokens.slice(0, tokens.length - local.tokenCount);
  return remaining.length === 0 ? null : remaining.join(' ');
}

export function reinterpretSvgIdentity(
  identity: SvgIdentity,
  actionName: string | null,
  localHint: SvgIdentityLocalCandidate | null,
  localCandidates: readonly SvgIdentityLocalCandidate[] = localHint === null ? [] : [localHint],
): SvgIdentity {
  const actionCanonical = actionName === null ? null : normalizeActionName(actionName);
  return {
    ...identity,
    status: actionCanonical === null || actionCanonical.length === 0 ? 'unknown' : 'parsed',
    actionName,
    actionCanonical,
    localHint: localHint === null
      ? null
      : {
          ...(localHint.id === undefined ? {} : { id: localHint.id }),
          label: localHint.label,
          raw: localHint.raw,
          canonical: localHint.canonical,
          position: localHint.position,
        },
    localCandidates,
  };
}

export function parseSvgIdentity(
  filename: string,
  options: SvgIdentityParseOptions = {},
): SvgIdentity {
  const baseName = basename(filename);
  const stem = stripSvgExtension(baseName);
  const tokens = displayTokens(stem);
  const detectedFormat = detectFormat(tokens, options.formats ?? DEFAULT_FORMATS);

  // El parser sólo separa estructura inequívoca. Action/local se decide después contra datos reales.
  const actionTokens = detectedFormat === null
    ? tokens
    : tokens.slice(0, detectedFormat.formatTokenIndex);
  const actionName = actionTokens.length === 0 ? null : actionTokens.join(' ');
  const actionCanonical = actionName === null ? null : normalizeActionName(actionName);

  return {
    status: actionCanonical === null || actionCanonical.length === 0 ? 'unknown' : 'parsed',
    originalFilename: filename,
    baseName,
    stem,
    actionName,
    actionCanonical,
    format: detectedFormat?.format ?? null,
    pieceIndex: detectedFormat?.pieceIndex ?? null,
    localHint: null,
    localCandidates: [],
  };
}

function remapCandidate(
  candidate: MatchCandidate,
  targets: readonly MatchTarget[],
): MatchCandidate {
  const index = Number.parseInt(candidate.id, 10);
  const target = Number.isSafeInteger(index) ? targets[index] : undefined;
  if (target === undefined) return candidate;

  return {
    ...candidate,
    id: target.id,
    label: target.label,
    canonical: normalizeActionName(target.label),
  };
}

function remapActionResult(result: MatchResult, targets: readonly MatchTarget[]): MatchResult {
  const candidates = result.candidates.map((candidate) => remapCandidate(candidate, targets));

  if (result.status === 'matched') {
    return {
      ...result,
      selected: remapCandidate(result.selected, targets),
      candidates,
    };
  }

  return { ...result, candidates };
}

export function matchAction(
  input: string | SvgIdentity,
  targets: readonly MatchTarget[],
  options: NameMatcherOptions = {},
): MatchResult {
  const actionName = typeof input === 'string' ? input : input.actionName;
  if (actionName === null) return { status: 'unmatched', candidates: [] };

  const canonicalAction = normalizeActionName(actionName);
  if (canonicalAction.length === 0) return { status: 'unmatched', candidates: [] };

  const normalizedTargets: MatchTarget[] = targets.map((target, index) => ({
    id: String(index),
    label: normalizeActionName(target.label),
  }));
  const result = matchName(canonicalAction, normalizedTargets, options);
  return remapActionResult(result, targets);
}
