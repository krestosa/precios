import type { FileTrace, FontRecord, PriceField, PriceSourceKind, SourceLoc } from '../domain/contracts';
import type { FontResolution } from '../features/font-resolver';
import { buildSvgPreviewModel } from '../features/svg-engine';
import type { FontView, PreviewView, WorkbenchFileView } from '../features/ui/models';
import type {
  AppRuntimeSnapshot,
  RuntimeFile,
  RuntimePriceAlternative,
  RuntimeSource,
} from './types';
import { fileStem } from './types';

function diagnosticMessage(code: string, message: string): string {
  return `${code}: ${message}`;
}

function traceSources(fields: readonly (PriceField | undefined)[]): FileTrace['sources'] {
  const bySource = new Map<string, { kind: PriceSourceKind; locations: SourceLoc[] }>();
  for (const field of fields) {
    if (!field || field.state !== 'known') continue;
    const current = bySource.get(field.provenance.sourceId) ?? { kind: field.provenance.sourceKind, locations: [] };
    if (field.provenance.loc) current.locations.push(field.provenance.loc);
    bySource.set(field.provenance.sourceId, current);
  }
  return [...bySource.entries()].map(([id, value]) => ({ id, kind: value.kind, locations: value.locations }));
}

function overlayMarkup(originalSvg: string, resultSvg: string): string {
  return `<!doctype html><html><body style="margin:0;background:transparent"><div style="display:grid"><div style="grid-area:1/1;opacity:.45">${originalSvg}</div><div style="grid-area:1/1;opacity:.75">${resultSvg}</div></div></body></html>`;
}

function previewView(file: RuntimeFile): PreviewView {
  const preview = file.generation?.preview ?? buildSvgPreviewModel(file.sourceSvg);
  const noOpResult =
    file.analysis.engineClassification === 'price-absent'
    || file.analysis.engineClassification === 'already-replaced-editable-price'
      ? file.sourceSvg
      : undefined;
  const resultSvg = preview.resultSvg ?? noOpResult;
  return {
    status: 'ready',
    original: { kind: 'markup', value: preview.originalSvg, label: `Original · ${file.fileName}` },
    ...(resultSvg === undefined
      ? {}
      : {
          result: { kind: 'markup' as const, value: resultSvg, label: `Resultado · ${file.fileName}` },
          overlay: {
            kind: 'markup' as const,
            value: overlayMarkup(preview.originalSvg, resultSvg),
            label: `Overlay · ${file.fileName}`,
          },
        }),
  };
}

export function fileTrace(file: RuntimeFile): FileTrace {
  const selected = file.match.status === 'matched' ? file.match.selected : undefined;
  const resolved = file.priceAlternatives.length === 1 ? file.priceAlternatives[0] : undefined;
  const normal = resolved?.record.prices.normal;
  const eminent = resolved?.record.prices.eminent;
  return {
    sourceSvg: { id: file.id, fileName: file.fileName },
    local: {
      raw: fileStem(file.fileName),
      ...(selected?.canonical === undefined ? {} : { canonical: selected.canonical }),
    },
    match: file.match.status === 'matched'
      ? {
          method: file.match.method,
          confidence: file.match.confidence,
          selectedId: file.match.selected.id,
          ...(file.match.method === 'manual' ? { manualOverride: true } : {}),
        }
      : {},
    pricing: {
      ...(normal === undefined ? {} : { normal }),
      ...(eminent === undefined ? {} : { eminent }),
      ...(file.priceIssue === undefined ? {} : { exception: file.priceIssue.message }),
    },
    sources: traceSources([normal, eminent]),
    warnings: file.preflight?.issues.filter((item) => item.severity === 'WARNING') ?? [],
    errors: file.preflight?.issues.filter((item) => item.severity === 'ERROR') ?? [],
    stableId: file.id,
  };
}

export function fileView(file: RuntimeFile, source: RuntimeSource | null): WorkbenchFileView {
  const resolved = file.priceAlternatives.length === 1 ? file.priceAlternatives[0] : undefined;
  const warnings = [
    ...file.analysis.diagnostics
      .filter((item) => !item.code.includes('ambiguous'))
      .map((item) => diagnosticMessage(item.code, item.message)),
    ...(file.priceIssue?.severity === 'WARNING' ? [file.priceIssue.message] : []),
  ];
  const errors = file.priceIssue?.severity === 'ERROR' ? [file.priceIssue.message] : [];
  return {
    id: file.id,
    fileName: file.fileName,
    detectedLocal: fileStem(file.fileName),
    match: file.match,
    classification: file.analysis.classification,
    ...(source === null ? {} : { sourceFileName: source.fileName }),
    ...(resolved === undefined ? {} : { rawGroup: resolved.record.scope.groupRaw ?? null, channel: resolved.record.channel }),
    ...(resolved === undefined
      ? {}
      : {
          prices: {
            ...(resolved.record.prices.normal === undefined ? {} : { normal: resolved.record.prices.normal }),
            ...(resolved.record.prices.eminent === undefined ? {} : { eminent: resolved.record.prices.eminent }),
            discount25: resolved.discount25,
          },
        }),
    ...(file.preflight === undefined ? {} : { preflight: file.preflight }),
    ...(file.generation === undefined ? {} : { generation: file.generation }),
    preview: previewView(file),
    trace: fileTrace(file),
    ...(warnings.length === 0 ? {} : { warnings }),
    ...(errors.length === 0 ? {} : { errors }),
    exportable: file.preflight !== undefined && !file.preflight.blocking,
  };
}

export function sourceSnapshot(source: RuntimeSource | null): AppRuntimeSnapshot['source'] {
  if (source === null) return null;
  return {
    fileName: source.fileName,
    diagnostics: source.diagnostics.map(({ code, message }) => ({ code, message })),
    products: source.rows.flatMap((row) => {
      if (row.kind !== 'product' || row.product === undefined) return [];
      return [{
        id: row.sourceRecordId,
        code: row.product.codeRaw,
        name: row.product.nameRaw,
        prices: row.slots.map((slot) => ({
          tier: slot.tier,
          groupRaw: slot.groupRaw,
          channel: slot.channel,
          state: slot.field.state,
          amount: slot.field.state === 'known' ? slot.field.amount : null,
        })),
      }];
    }),
  };
}

export function runtimePriceAlternatives(file: RuntimeFile): readonly RuntimePriceAlternative[] {
  return file.priceAlternatives.map((entry) => ({
    id: entry.record.id,
    groupRaw: entry.record.scope.groupRaw ?? null,
    channel: entry.record.channel,
    normal: entry.record.prices.normal ?? null,
    eminent: entry.record.prices.eminent ?? null,
  }));
}

function fontView(id: string, record: FontRecord, uiStatus: FontView['uiStatus']): FontView {
  return { id, record, uiStatus };
}

export function resolutionFontView(resolution: FontResolution, index: number): FontView {
  if (resolution.record !== undefined) {
    return fontView(
      resolution.record.file?.id ?? `font:${index}:${resolution.requested.family}`,
      resolution.record,
      resolution.status === 'resolved'
        ? resolution.record.source === 'uploaded' ? 'uploaded' : 'installed'
        : 'mismatch',
    );
  }
  return fontView(
    `font:${index}:${resolution.requested.family}`,
    {
      spec: resolution.requested,
      source: 'unavailable',
      status: 'unavailable',
      diagnostics: resolution.diagnostics,
    },
    resolution.status === 'mismatch' ? 'mismatch' : 'missing',
  );
}
