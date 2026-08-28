import type { FileTrace, FontRecord, PriceField, PriceSourceKind, SourceLoc } from '../domain/contracts';
import type { FontRegistrationResult, FontResolution } from '../features/font-resolver';
import { buildSvgPreviewModel } from '../features/svg-engine';
import type { FontView, PreviewView, ProcessingState, WorkbenchFileView } from '../features/ui/models';
import type {
  AppRuntimeSnapshot,
  RuntimeFile,
  RuntimeOutput,
  RuntimePriceAlternative,
  RuntimeSource,
} from './types';

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

function outputGeneration(file: RuntimeFile, output?: RuntimeOutput) {
  return output?.generation ?? file.generation;
}

function outputPreflight(file: RuntimeFile, output?: RuntimeOutput) {
  return output?.preflight ?? file.preflight;
}

function previewView(file: RuntimeFile, output?: RuntimeOutput): PreviewView {
  const generation = outputGeneration(file, output);
  const preview = generation?.preview ?? buildSvgPreviewModel(file.sourceSvg);
  const noOpResult =
    file.analysis.engineClassification === 'price-absent'
    || file.analysis.engineClassification === 'already-replaced-editable-price'
      ? file.sourceSvg
      : undefined;
  const resultSvg = preview.resultSvg ?? noOpResult;
  const labelName = output?.outputName ?? file.fileName;
  return {
    status: 'ready',
    original: { kind: 'markup', value: preview.originalSvg, label: `Original · ${file.fileName}` },
    ...(resultSvg === undefined
      ? {}
      : {
          result: { kind: 'markup' as const, value: resultSvg, label: `Resultado · ${labelName}` },
          overlay: {
            kind: 'markup' as const,
            value: overlayMarkup(preview.originalSvg, resultSvg),
            label: `Overlay · ${labelName}`,
          },
        }),
  };
}

export function fileTrace(file: RuntimeFile, output?: RuntimeOutput): FileTrace {
  const resolved = output?.pricing ?? (file.priceAlternatives.length === 1 ? file.priceAlternatives[0] : undefined);
  const normal = resolved?.record.prices.normal;
  const eminent = resolved?.record.prices.eminent;
  const preflight = outputPreflight(file, output);
  const exception = output?.issue?.message ?? file.priceIssue?.message;
  return {
    sourceSvg: { id: file.id, fileName: file.fileName },
    local: file.identity.sourceLocal === null
      ? {}
      : { raw: file.identity.sourceLocal, canonical: file.identity.sourceLocalCanonical ?? undefined },
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
      ...(exception === undefined ? {} : { exception }),
    },
    sources: traceSources([normal, eminent]),
    warnings: preflight?.issues.filter((item) => item.severity === 'WARNING') ?? [],
    errors: preflight?.issues.filter((item) => item.severity === 'ERROR') ?? [],
    stableId: output?.id ?? file.id,
  };
}

function completedProcessingState(warnings: readonly string[], errors: readonly string[]): ProcessingState {
  if (errors.length > 0) return 'warning';
  if (warnings.length > 0) return 'warning';
  return 'ready';
}

function derivedTargets(file: RuntimeFile): NonNullable<WorkbenchFileView['derivedTargets']> {
  return file.outputs.map((output) => ({
    id: output.id,
    pricingGroup: output.pricingGroup,
    scopes: output.scopeLabels,
    ...(output.pricing?.record.prices.normal === undefined ? {} : { normal: output.pricing.record.prices.normal }),
    ...(output.pricing?.record.prices.eminent === undefined ? {} : { eminent: output.pricing.record.prices.eminent }),
    overridden: output.overridden,
    blocking: output.issue?.severity === 'ERROR' || output.preflight?.blocking === true,
  }));
}

export function fileView(file: RuntimeFile, source: RuntimeSource | null, output?: RuntimeOutput): WorkbenchFileView {
  const resolved = output?.pricing ?? (source !== null && file.priceAlternatives.length === 1 ? file.priceAlternatives[0] : undefined);
  const preflight = outputPreflight(file, output);
  const generation = outputGeneration(file, output);
  const outputIssue = output?.issue ?? file.priceIssue;
  const warnings = [
    ...file.analysis.diagnostics
      .filter((item) => !item.code.includes('ambiguous'))
      .map((item) => diagnosticMessage(item.code, item.message)),
    ...(source !== null && outputIssue?.severity === 'WARNING' ? [outputIssue.message] : []),
  ];
  const errors = source !== null && outputIssue?.severity === 'ERROR' ? [outputIssue.message] : [];
  const outputName = output?.outputName ?? file.fileName;
  const outputId = output?.id ?? file.id;
  return {
    id: outputId,
    fileName: outputName,
    sourceArtworkFileName: file.fileName,
    processingState: completedProcessingState(warnings, errors),
    ...(file.identity.sourceLocal === null ? {} : { detectedLocal: file.identity.sourceLocal }),
    sourceScope: file.identity.sourceScope,
    sourceLocal: file.identity.sourceLocal,
    classification: file.analysis.classification,
    ...(source === null
      ? {}
      : {
          match: file.match,
          sourceFileName: source.fileName,
          trace: fileTrace(file, output),
        }),
    ...(output?.pricingGroup === undefined ? {} : { rawGroup: output.pricingGroup }),
    ...(resolved === undefined ? {} : { channel: resolved.record.channel }),
    ...(output === undefined ? {} : { targetScopes: output.scopeLabels }),
    derivedTargets: derivedTargets(file),
    ...(resolved === undefined
      ? {}
      : {
          prices: {
            ...(resolved.record.prices.normal === undefined ? {} : { normal: resolved.record.prices.normal }),
            ...(resolved.record.prices.eminent === undefined ? {} : { eminent: resolved.record.prices.eminent }),
            discount25: resolved.discount25,
          },
        }),
    ...(preflight === undefined ? {} : { preflight }),
    ...(generation === undefined ? {} : { generation }),
    preview: previewView(file, output),
    ...(warnings.length === 0 ? {} : { warnings }),
    ...(errors.length === 0 ? {} : { errors }),
    exportable: output?.overridden !== true && preflight !== undefined && !preflight.blocking,
  };
}

export function formatUploadMetadata(file: File): string {
  const bytes = file.size;
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const size = unitIndex === 0 ? `${value} ${units[unitIndex]}` : `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  const type = file.type.trim().length > 0 ? file.type : 'tipo no informado';
  return `${size} · ${type}`;
}

export function sourceReadyMessage(source: RuntimeSource): string {
  const products = source.rows.filter((row) => row.kind === 'product' && row.product !== undefined);
  const groups = new Set<string>();
  const channels = new Set<string>();
  let knownPrices = 0;

  for (const row of products) {
    for (const slot of row.slots) {
      if (slot.groupRaw.trim().length > 0) groups.add(slot.groupRaw);
      channels.add(slot.channelHeaderRaw?.trim() || slot.channel);
      if (slot.field.state === 'known') knownPrices += 1;
    }
  }

  const diagnostics = source.diagnostics.length === 0 ? '' : ` · ${source.diagnostics.length} diagnóstico(s)`;
  return `Listo · ${source.rows.length} fila(s) · ${products.length} producto(s) · ${groups.size} grupo(s) · ${channels.size} scope(s) · ${knownPrices} precio(s) explícito(s)${diagnostics}`;
}

export function pendingSvgView(id: string, file: File, source: RuntimeSource | null): WorkbenchFileView {
  return {
    id,
    fileName: file.name,
    sourceArtworkFileName: file.name,
    processingState: 'processing',
    processingMessage: 'Analizando archivo SVG.',
    ...(source === null ? {} : { sourceFileName: source.fileName }),
    exportable: false,
  };
}

export function failedSvgView(id: string, file: File, source: RuntimeSource | null, message: string): WorkbenchFileView {
  return {
    ...pendingSvgView(id, file, source),
    processingState: 'error',
    processingMessage: message,
    errors: [message],
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
          channel: slot.channelHeaderRaw?.trim() || slot.channel,
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

function fontView(
  id: string,
  displayName: string,
  processingState: ProcessingState,
  record?: FontRecord,
  uiStatus?: FontView['uiStatus'],
  message?: string,
): FontView {
  return {
    id,
    displayName,
    processingState,
    ...(record === undefined ? {} : { record }),
    ...(uiStatus === undefined ? {} : { uiStatus }),
    ...(message === undefined ? {} : { message }),
  };
}

export function pendingFontView(id: string, file: File): FontView {
  return fontView(id, file.name, 'processing', undefined, undefined, `Procesando… · ${formatUploadMetadata(file)}`);
}

export function failedFontView(id: string, file: File, message: string): FontView {
  return fontView(id, file.name, 'error', undefined, undefined, message);
}

export function resolutionFontView(resolution: FontResolution, index: number): FontView {
  const displayName = resolution.record?.file?.originalName ?? resolution.requested.family;
  if (resolution.record !== undefined) {
    const uiStatus = resolution.status === 'resolved'
      ? resolution.record.source === 'uploaded' ? 'uploaded' : 'installed'
      : 'mismatch';
    return fontView(
      resolution.record.file?.id ?? `font:${index}:${resolution.requested.family}`,
      displayName,
      resolution.status === 'resolved' ? 'ready' : 'warning',
      resolution.record,
      uiStatus,
      resolution.diagnostics[0]?.message,
    );
  }
  const record: FontRecord = {
    spec: resolution.requested,
    source: 'unavailable',
    status: 'unavailable',
    diagnostics: resolution.diagnostics,
  };
  return fontView(
    `font:${index}:${resolution.requested.family}`,
    displayName,
    resolution.status === 'mismatch' ? 'warning' : 'error',
    record,
    resolution.status === 'mismatch' ? 'mismatch' : 'missing',
    resolution.diagnostics[0]?.message,
  );
}

export function registeredFontView(result: FontRegistrationResult): FontView | undefined {
  if (result.status !== 'registered' || result.registered === undefined) return undefined;
  const record: FontRecord = {
    spec: result.registered.spec,
    source: 'uploaded',
    status: 'available',
    file: result.registered.meta,
    diagnostics: result.diagnostics,
  };
  return fontView(
    result.registered.id,
    result.registered.meta.originalName ?? result.registered.spec.family,
    result.diagnostics.length > 0 ? 'warning' : 'ready',
    record,
    'uploaded',
    result.diagnostics[0]?.message,
  );
}
