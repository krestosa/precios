import type { MatchResult } from '../../domain/contracts/matching';
import type { MatchTarget, NameMatcherOptions } from './name-matcher';
import { matchAction, parseSvgIdentity } from './svg-identity';

/**
 * Adapta el nombre estructural de un SVG al matcher data-driven sin introducir
 * conocimiento de campañas, acciones, locales ni índices concretos.
 */
export function matchSvgRuntimeName(
  input: string,
  targets: readonly MatchTarget[],
  options: NameMatcherOptions = {},
): MatchResult {
  const identity = parseSvgIdentity(input);
  return matchAction(identity, targets, options);
}
