import { describe, expect, it } from 'vitest';
import { prepareSvgPricingContext, type PricingMatrixModel } from './pricing-resolution';

function model(actions: readonly string[], locals: readonly string[] = []): PricingMatrixModel {
  return {
    rows: actions.map((action, index) => ({
      kind: 'product' as const,
      sourceRow: index + 100,
      sourceRecordId: `w6-row-${index}`,
      product: { codeRaw: `W6-${index}`, nameRaw: action },
      slots: [],
    })),
    headers: {
      normalGroups: locals.map((local, index) => ({
        tier: 'NORMAL' as const,
        groupRaw: local,
        salonColumn: index * 2 + 3,
        deliColumn: index * 2 + 4,
        salonHeaderRaw: 'SALÓN',
        deliHeaderRaw: 'DELI',
      })),
      eminentGroups: [],
    },
  };
}

function selectedAction(context: ReturnType<typeof prepareSvgPricingContext>): string | null {
  return context.action.result.status === 'matched' ? context.action.result.selected.label : null;
}

describe('W6 gate de generalización action data-driven', () => {
  it('reconoce una acción inédita creada en runtime sin catálogo ni alias productivo', () => {
    const dynamicAction = ['Órbita', 'Esmeralda', String(314159)].join(' ');
    const context = prepareSvgPricingContext(
      `${dynamicAction} Banner 7.svg`,
      model([dynamicAction]),
    );

    expect(context.identity.format).toBe('banner');
    expect(context.identity.pieceIndex).toBe(7);
    expect(context.action.result.status).toBe('matched');
    expect(selectedAction(context)).toBe(dynamicAction);
    expect(context.action.selectedHypothesisId).toBe('action-only');
    expect(context.actionFamily).toBeNull();
  });

  it('fuzzy queda sólo como suggestion y nunca selecciona fila automáticamente', () => {
    const context = prepareSvgPricingContext(
      'Festival Estelra Story.svg',
      model(['Festival Estelar']),
      { matcher: { fuzzySuggestionThreshold: 0.3, fuzzyCandidateFloor: 0 } },
    );

    expect(context.action.result.status).toBe('suggestion');
    if (context.action.result.status === 'suggestion') {
      expect(context.action.result.method).toBe('fuzzy-suggestion');
      expect(context.action.result.candidates[0]?.label).toBe('Festival Estelar');
    }
    expect(context.action.selectedRow).toBeNull();
    expect(context.action.selectedHypothesisId).toBeNull();
  });

  it('canonical exact vence a un candidato que sólo sería partial', () => {
    const context = prepareSvgPricingContext(
      'Campaña Solar Feed.svg',
      model(['Campaña Solar Premium', 'Campaña Solar']),
    );

    expect(context.action.result.status).toBe('matched');
    if (context.action.result.status === 'matched') {
      expect(context.action.result.method).toBe('canonical-exact');
      expect(context.action.result.selected.label).toBe('Campaña Solar');
    }
  });

  it('cumple el contrato ambiguous en el empate Recova solicitado', () => {
    const context = prepareSvgPricingContext(
      '2 Tiempos Recova Story 1.svg',
      model(['2 Tiempos Recova', '2 Tiempos'], ['Recova']),
    );

    expect(context.action.result.status).toBe('ambiguous');
    if (context.action.result.status === 'ambiguous') {
      expect(context.action.result.requiresHuman).toBe(true);
      expect(context.action.result.candidates.map((candidate) => candidate.label)).toEqual(
        expect.arrayContaining(['2 Tiempos Recova', '2 Tiempos']),
      );
    }
    expect(context.action.selectedRow).toBeNull();
    expect(context.action.selectedHypothesisId).toBeNull();
    expect(context.identity.localHint).toBeNull();
    expect(context.identity.localCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Recova', position: 'suffix' }),
      ]),
    );
    expect(context.action.hypotheses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'action-only', kind: 'action-only', evidenceStrength: 3 }),
        expect.objectContaining({ id: 'local-suffix:recova', kind: 'local-suffix', evidenceStrength: 3 }),
      ]),
    );
    expect(context.actionFamily).toBeNull();
  });

  it('preserva A/B/C cuando existen las tres interpretaciones y empatan', () => {
    const context = prepareSvgPricingContext(
      'Palermo Festival Palermo Story.svg',
      model(
        ['Palermo Festival Palermo', 'Festival Palermo', 'Palermo Festival'],
        ['Palermo'],
      ),
    );

    expect(context.action.result.status).toBe('ambiguous');
    expect(context.action.selectedRow).toBeNull();
    expect(context.action.selectedHypothesisId).toBeNull();
    expect(context.identity.localHint).toBeNull();
    expect(new Set(context.action.hypotheses.map((hypothesis) => hypothesis.kind))).toEqual(
      new Set(['action-only', 'local-prefix', 'local-suffix']),
    );
    expect(context.identity.localCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Palermo', position: 'prefix' }),
        expect.objectContaining({ label: 'Palermo', position: 'suffix' }),
      ]),
    );
    if (context.action.result.status === 'ambiguous') {
      expect(context.action.result.candidates.map((candidate) => candidate.label)).toEqual(
        expect.arrayContaining(['Palermo Festival Palermo', 'Festival Palermo', 'Palermo Festival']),
      );
    }
  });
});
