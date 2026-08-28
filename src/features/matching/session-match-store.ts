import type { MatchCandidate, MatchResult, SessionOverride } from '../../domain/contracts/matching';

export class SessionMatchStore {
  readonly sessionId: string;
  private readonly overrides = new Map<string, SessionOverride>();

  constructor(sessionId: string) {
    if (sessionId.trim().length === 0) {
      throw new Error('La sesión de matching debe tener un identificador no vacío.');
    }
    this.sessionId = sessionId;
  }

  record(inputId: string, candidateId: string): SessionOverride {
    const override: SessionOverride = {
      inputId,
      candidateId,
      sessionId: this.sessionId,
      selectedBy: 'human',
    };
    this.overrides.set(inputId, override);
    return override;
  }

  get(inputId: string): SessionOverride | undefined {
    return this.overrides.get(inputId);
  }

  remove(inputId: string): boolean {
    return this.overrides.delete(inputId);
  }

  clear(): void {
    this.overrides.clear();
  }

  list(): readonly SessionOverride[] {
    return [...this.overrides.values()];
  }

  resolve(inputId: string, candidates: readonly MatchCandidate[]): MatchResult | null {
    const override = this.overrides.get(inputId);
    if (override === undefined) {
      return null;
    }

    const exists = candidates.some((candidate) => candidate.id === override.candidateId);
    if (!exists) {
      return null;
    }

    const manualCandidates = candidates.map((candidate) =>
      candidate.id === override.candidateId
        ? { ...candidate, method: 'manual' as const, confidence: 1 }
        : candidate,
    );
    const selected = manualCandidates.find((candidate) => candidate.id === override.candidateId);
    if (selected === undefined) {
      return null;
    }

    return {
      status: 'matched',
      method: 'manual',
      confidence: 1,
      selected,
      candidates: manualCandidates,
    };
  }
}
