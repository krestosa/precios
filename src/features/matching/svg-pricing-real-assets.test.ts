import { describe, expect, it } from 'vitest';
import { matchName as matchRawName } from './name-matcher';
import { prepareSvgPricingContext, type PricingMatrixModel } from './pricing-resolution';
import { matchSvgRuntimeName } from './runtime-name-matcher';

const DISTRACTORS = ['Story 1', 'Story 7', 'Feed 1', 'Feed 7', 'Mailing'] as const;

function model(actions: readonly string[]): PricingMatrixModel {
  return {
    rows: actions.map((action, index) => ({
      kind: 'product' as const,
      sourceRow: index + 10,
      sourceRecordId: `row-${index}`,
      product: { codeRaw: `P${index}`, nameRaw: action },
      slots: [],
    })),
    headers: {
      normalGroups: [],
      eminentGroups: [],
    },
  };
}

function selectedAction(context: ReturnType<typeof prepareSvgPricingContext>): string | null {
  return context.action.result.status === 'matched' ? context.action.result.selected.label : null;
}

describe('regresión de identidad para SVG reales', () => {
  it.each([
    ['Tres Tiempos Story 1.svg', 'Story 1'],
    ['Tres Tiempos Story 7.svg', 'Story 7'],
    ['Tres Tiempos Feed 1.svg', 'Feed 1'],
    ['Tres Tiempos Feed 7.svg', 'Feed 7'],
    ['Tres Tiempos Mailing.svg', 'Mailing'],
  ] as const)('reproduce la ambigüedad previa de %s y verifica el adaptador corregido', (filename, distractor) => {
    const targets = [
      { id: 'action', label: 'Tres Tiempos' },
      { id: 'distractor', label: distractor },
    ];
    const stem = filename.replace(/\.svg$/iu, '');
    const legacy = matchRawName(stem, targets);
    const fixed = matchSvgRuntimeName(stem, targets);

    expect(legacy.status).toBe('ambiguous');
    expect(legacy.candidates.map((candidate) => candidate.label)).toEqual(
      expect.arrayContaining(['Tres Tiempos', distractor]),
    );
    expect(fixed.status).toBe('matched');
    if (fixed.status === 'matched') {
      expect(fixed.selected.label).toBe('Tres Tiempos');
      expect(fixed.method).toBe('canonical-exact');
    }
  });

  it.each([
    ['Tres Tiempos Story 1.svg', 'story', 1],
    ['Tres Tiempos Story 7.svg', 'story', 7],
    ['Tres Tiempos Feed 1.svg', 'feed', 1],
    ['Tres Tiempos Feed 7.svg', 'feed', 7],
    ['Tres Tiempos Mailing.svg', 'mailing', null],
  ] as const)('resuelve %s sin contaminar la acción con formato/índice', (filename, format, pieceIndex) => {
    const context = prepareSvgPricingContext(
      filename,
      model(['Tres Tiempos', ...DISTRACTORS]),
    );

    expect(context.identity.actionName).toBe('Tres Tiempos');
    expect(context.identity.format).toBe(format);
    expect(context.identity.pieceIndex).toBe(pieceIndex);
    expect(selectedAction(context)).toBe('Tres Tiempos');
    expect(context.action.result.status).toBe('matched');
    expect(context.action.selectedHypothesisId).toBe('action-only');
    expect(context.actionFamily).toBeNull();
  });

  it('resuelve una acción sintética nunca vista sin catálogo ni alias productivo', () => {
    const generatedAction = ['Órbita', 'Quásar', String(8100 + 37)].join(' ');
    const context = prepareSvgPricingContext(
      `${generatedAction} Story 1.svg`,
      model([generatedAction, ...DISTRACTORS]),
    );

    expect(context.identity.actionName).toBe(generatedAction);
    expect(context.identity.format).toBe('story');
    expect(context.identity.pieceIndex).toBe(1);
    expect(selectedAction(context)).toBe(generatedAction);
    expect(context.action.result.status).toBe('matched');
  });
});
