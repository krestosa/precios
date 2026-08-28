import { describe, expect, it } from 'vitest';
import { prepareSvgPricingContext, type PricingMatrixModel } from './pricing-resolution';

function model(actions: readonly string[], locals: readonly string[] = []): PricingMatrixModel {
  return {
    rows: actions.map((action, index) => ({
      kind: 'product' as const,
      sourceRow: index + 10,
      sourceRecordId: `row-${index}`,
      product: { codeRaw: `P${index}`, nameRaw: action },
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

describe('matcher data-driven de acciones SVG', () => {
  it('resuelve una campaña sintética nunca vista con formato e índice', () => {
    const context = prepareSvgPricingContext(
      'Campaña Nunca Vista 2027 Feed 4.svg',
      model(['Campaña Nunca Vista 2027']),
    );

    expect(context.identity.format).toBe('feed');
    expect(context.identity.pieceIndex).toBe(4);
    expect(selectedAction(context)).toBe('Campaña Nunca Vista 2027');
  });

  it('no trata Deli como token reservado aunque también exista como local', () => {
    const context = prepareSvgPricingContext(
      'Deli Festival Especial Mailing.svg',
      model(['Deli Festival Especial'], ['Deli']),
    );

    expect(context.identity.format).toBe('mailing');
    expect(selectedAction(context)).toBe('Deli Festival Especial');
    expect(context.action.selectedHypothesisId).toBe('action-only');
    expect(context.suggestedLocal).toBeNull();
  });

  it('no recorta un local real cuando aparece dentro de una acción real', () => {
    const context = prepareSvgPricingContext(
      'Especial Palermo Nocturno Story 1.svg',
      model(['Especial Palermo Nocturno'], ['Palermo']),
    );

    expect(selectedAction(context)).toBe('Especial Palermo Nocturno');
    expect(context.action.selectedHypothesisId).toBe('action-only');
    expect(context.suggestedLocal).toBeNull();
  });

  it('prefiere por evidencia la acción completa frente a recortar un sufijo-local', () => {
    const context = prepareSvgPricingContext(
      '2 Tiempos Recova Story 1.svg',
      model(['2 Tiempos Recova'], ['Recova']),
    );

    expect(selectedAction(context)).toBe('2 Tiempos Recova');
    expect(context.action.selectedHypothesisId).toBe('action-only');
    expect(context.action.hypotheses.map((hypothesis) => hypothesis.kind)).toContain('local-suffix');
  });

  it('marca ambiguous si action completa y action+local tienen evidencia exacta equivalente', () => {
    const context = prepareSvgPricingContext(
      '2 Tiempos Recova Story 1.svg',
      model(['2 Tiempos Recova', '2 Tiempos'], ['Recova']),
    );

    expect(context.action.result.status).toBe('ambiguous');
    expect(context.action.result.candidates.map((candidate) => candidate.label)).toEqual(
      expect.arrayContaining(['2 Tiempos Recova', '2 Tiempos']),
    );
    expect(context.action.selectedHypothesisId).toBeNull();
  });

  it('normaliza palabras numéricas de forma general contra cifras', () => {
    const context = prepareSvgPricingContext(
      'Tres Tiempos Story 1.svg',
      model(['3 Tiempos']),
    );

    expect(selectedAction(context)).toBe('3 Tiempos');
    expect(context.action.result.status).toBe('matched');
    if (context.action.result.status === 'matched') {
      expect(context.action.result.method).toBe('canonical-exact');
    }
  });

  it('resuelve local prefijo cuando esa hipótesis tiene evidencia más fuerte', () => {
    const context = prepareSvgPricingContext(
      'Palermo Campaña Nueva Feed.svg',
      model(['Campaña Nueva'], ['Palermo']),
    );

    expect(selectedAction(context)).toBe('Campaña Nueva');
    expect(context.action.selectedHypothesisId).toBe('local-prefix:palermo');
    expect(context.suggestedLocal?.label).toBe('Palermo');
  });
});
