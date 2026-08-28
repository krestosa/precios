import type { FilePreflight, PreflightIssue } from '../domain/contracts';
import { reconcilePriceSlots } from '../domain/pricing/reconcile';
import { adaptObservedPricingMatrix, loadLocalWorkbook, type PricingMatrixAdaptedRow } from '../features/data-source';
import { buildExportBundle, type ExportBundleResult } from '../features/export';
import { BrowserFontResolver, requiredFontsFromSvgAnalyses, type FontResolution } from '../features/font-resolver';
import { matchName, SessionMatchStore } from '../features/matching';
import {
  buildSvgFilePreflight,
  buildSvgPreviewModel,
  createBrowserTextMeasurer,
  generateSvgPrices,
  analyzeSvg,
  type SvgEngineGenerationResult,
} from '../features/svg-engine';
import type { WorkbenchEventMap } from '../features/ui/events';
import type { PriceWorkbench } from '../features/ui/workbench';
import type { PreciosAppCommandName } from '../features/ui/control-api/types';
import { fileTrace, fileView, resolutionFontView, runtimePriceAlternatives, sourceSnapshot } from './view-model';
import {
  emptyModel,
  fileStem,
  known,
  preflightIssue,
  targetRequiresPrices,
  type AppRuntimeController,
  type AppRuntimeSnapshot,
  type RuntimeFile,
  type RuntimeSource,
} from './types';

const APP_SLOT = '__preciosAppRuntimeV1' as const;
type RuntimeHost = PriceWorkbench & { [APP_SLOT]?: AppRuntimeController };

function diagnosticMessage(code: string, message: string): string {
  return `${code}: ${message}`;
}

function triggerDownload(fileName: string, bytes: string | Uint8Array, mimeType: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const part: BlobPart = typeof bytes === 'string' ? bytes : bytes.slice().buffer as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([part], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function installAppRuntimeController(workbench: PriceWorkbench): AppRuntimeController {
  const host = workbench as RuntimeHost;
  host[APP_SLOT]?.dispose();

  let disposed = false;
  let operationRevision = 0;
  let source: RuntimeSource | null = null;
  let fileSequence = 0;
  let files = new Map<string, RuntimeFile>();
  let exportResult: AppRuntimeSnapshot['exportResult'] = null;
  let previewCommand: AppRuntimeSnapshot['preview'] = null;
  const pending = new Map<PreciosAppCommandName, Promise<void>>();
  const stateListeners = new Set<() => void>();
  const matchStore = new SessionMatchStore('preview-runtime');
  const fontResolver = new BrowserFontResolver();
  let model = emptyModel();

  const publish = (): void => {
    if (disposed) return;
    model.files = [...files.values()].map((file) => fileView(file, source));
    workbench.model = { ...model };
    stateListeners.forEach((listener) => listener());
  };

  const track = (command: PreciosAppCommandName, task: Promise<void>): void => {
    const guarded = task.catch((error) => {
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      if (command === 'source.load') model.source = { ...model.source, status: 'error', message };
      if (command === 'svg.load') model.svgLoadStatus = 'error';
      if (command === 'font.load') model.fontLoadStatus = 'error';
      if (command === 'export.request') {
        exportResult = {
          status: 'error',
          kind: 'export',
          hashAlgorithm: 'sha256',
          sha256: null,
          partial: true,
          artifactNames: [],
          message,
        };
      }
      publish();
    }).finally(() => {
      if (pending.get(command) === guarded) pending.delete(command);
    });
    pending.set(command, guarded);
  };

  const priceTargets = (): readonly { readonly id: string; readonly label: string }[] => {
    if (source === null) return [];
    return source.rows.flatMap((row) =>
      row.kind === 'product' && row.product !== undefined
        ? [{ id: row.sourceRecordId, label: row.product.nameRaw }]
        : [],
    );
  };

  const rowForCandidate = (candidateId: string): PricingMatrixAdaptedRow | undefined =>
    source?.rows.find((row) => row.sourceRecordId === candidateId && row.kind === 'product');

  const resolvePrices = (file: RuntimeFile): void => {
    file.priceAlternatives = [];
    delete file.priceIssue;
    if (file.match.status !== 'matched') return;
    const row = rowForCandidate(file.match.selected.id);
    if (row === undefined) {
      file.priceIssue = preflightIssue('ERROR', 'pricing.record-not-found', 'El matching seleccionado no tiene un registro de precios asociado.');
      return;
    }
    const reconciled = reconcilePriceSlots(row.slots);
    const complete = reconciled.records.filter((entry) =>
      known(entry.record.prices.normal) && known(entry.record.prices.eminent),
    );
    file.priceAlternatives = complete;
    if (complete.length === 0) {
      file.priceIssue = preflightIssue('ERROR', 'pricing.explicit-pair-missing', 'No existe un par NORMAL/ÉMINENT explícito y completo para el producto seleccionado.');
    } else if (complete.length > 1) {
      file.priceIssue = preflightIssue(
        'WARNING',
        'pricing.scope-unresolved',
        'Hay más de un grupo/canal con precios explícitos. Se preservan todos y no se aplica precedencia automática.',
      );
    }
  };

  const recomputeMatch = (file: RuntimeFile): void => {
    const base = matchName(fileStem(file.fileName), priceTargets());
    const override = matchStore.resolve(file.id, base.candidates);
    file.match = override ?? base;
    resolvePrices(file);
  };

  const refreshMatching = (): void => {
    for (const file of files.values()) recomputeMatch(file);
  };

  const onSourceFiles = async (detail: WorkbenchEventMap['pw:price-source-files']): Promise<void> => {
    const revision = ++operationRevision;
    exportResult = null;
    model.source = {
      status: 'loading',
      ...(detail.files[0] === undefined ? {} : { fileName: detail.files[0].name }),
      capabilities: { csv: true, xlsx: true, xls: true },
    };
    publish();
    if (detail.files.length !== 1) {
      source = null;
      model.source = {
        status: 'error',
        capabilities: { csv: true, xlsx: true, xls: true },
        message: 'Debe cargarse exactamente un archivo CSV/XLSX/XLS como fuente de precios.',
      };
      publish();
      return;
    }
    const file = detail.files[0]!;
    const data = await file.arrayBuffer();
    if (disposed || revision !== operationRevision) return;
    const loaded = loadLocalWorkbook({ sourceId: `local:${file.name}`, fileName: file.name, data });
    const readySnapshots = loaded.snapshots.filter((snapshot) => snapshot.status === 'ready');
    if (readySnapshots.length === 0) {
      source = null;
      model.source = {
        status: 'error',
        fileName: file.name,
        capabilities: { csv: true, xlsx: true, xls: true },
        message: loaded.diagnostics.map((item) => diagnosticMessage(item.code, item.message)).join(' · ') || 'La fuente no produjo datos utilizables.',
      };
      publish();
      return;
    }
    const adapted = readySnapshots.map((snapshot) => adaptObservedPricingMatrix(snapshot));
    source = {
      fileName: file.name,
      rows: adapted.flatMap((item) => item.rows),
      diagnostics: [...loaded.diagnostics, ...adapted.flatMap((item) => item.diagnostics)],
    };
    model.source = {
      status: 'ready',
      fileName: file.name,
      capabilities: { csv: true, xlsx: true, xls: true },
      ...(source.diagnostics.length === 0 ? {} : { message: `${source.diagnostics.length} diagnóstico(s) preservados de la fuente.` }),
    };
    refreshMatching();
    delete model.preflight;
    publish();
  };

  const onSvgFiles = async (detail: WorkbenchEventMap['pw:svg-files']): Promise<void> => {
    const revision = ++operationRevision;
    exportResult = null;
    model.svgLoadStatus = 'loading';
    delete model.preflight;
    publish();
    matchStore.clear();
    const next = new Map<string, RuntimeFile>();
    for (const file of detail.files) {
      const svg = await file.text();
      if (disposed || revision !== operationRevision) return;
      fileSequence += 1;
      const id = `svg:${fileSequence}:${file.name}`;
      const analysis = analyzeSvg(svg);
      const runtimeFile: RuntimeFile = {
        id,
        fileName: file.name,
        sourceSvg: svg,
        analysis,
        match: matchName(fileStem(file.name), priceTargets()),
        priceAlternatives: [],
      };
      resolvePrices(runtimeFile);
      next.set(id, runtimeFile);
    }
    files = next;
    model.svgLoadStatus = 'ready';
    publish();
  };

  const currentFontResolutions = (file: RuntimeFile): readonly FontResolution[] => {
    if (typeof document === 'undefined' || document.fonts === undefined) return [];
    const required = requiredFontsFromSvgAnalyses([file.analysis]);
    return fontResolver.resolveRequired(required);
  };

  const onFontFiles = async (detail: WorkbenchEventMap['pw:font-files']): Promise<void> => {
    const revision = ++operationRevision;
    model.fontLoadStatus = 'loading';
    publish();
    for (const file of detail.files) {
      const bytes = await file.arrayBuffer();
      if (disposed || revision !== operationRevision) return;
      await fontResolver.registerUpload({ name: file.name, mimeType: file.type, bytes });
    }
    const analyses = [...files.values()].map((file) => file.analysis);
    const required = requiredFontsFromSvgAnalyses(analyses);
    const resolutions = typeof document === 'undefined' || document.fonts === undefined
      ? []
      : fontResolver.resolveRequired(required);
    model.fonts = resolutions.map(resolutionFontView);
    model.fontLoadStatus = 'ready';
    delete model.preflight;
    for (const file of files.values()) delete file.preflight;
    publish();
  };

  const analysisOnlyGeneration = (file: RuntimeFile): SvgEngineGenerationResult => {
    const preview = buildSvgPreviewModel(file.sourceSvg);
    return {
      status: 'skipped',
      classification: file.analysis.classification,
      targets: file.analysis.targets.map((target) => target.descriptor),
      overflow: [],
      diagnostics: file.analysis.diagnostics,
      analysis: file.analysis,
      preview,
    };
  };

  const runGeneration = async (file: RuntimeFile): Promise<SvgEngineGenerationResult | undefined> => {
    if (!targetRequiresPrices(file.analysis)) {
      return generateSvgPrices({
        svg: file.sourceSvg,
        prices: { normal: '', eminent: '' },
        measurer: createBrowserTextMeasurer(),
      });
    }
    if (file.match.status !== 'matched' || file.priceAlternatives.length !== 1) return undefined;
    const pricing = file.priceAlternatives[0]!;
    const normal = pricing.record.prices.normal;
    const eminent = pricing.record.prices.eminent;
    if (!known(normal) || !known(eminent)) return undefined;
    return generateSvgPrices({
      svg: file.sourceSvg,
      prices: { normal: String(normal.amount), eminent: String(eminent.amount) },
      measurer: createBrowserTextMeasurer(),
    });
  };

  const additionalPreflightIssues = (file: RuntimeFile): readonly PreflightIssue[] => {
    if (!targetRequiresPrices(file.analysis)) return [];
    if (file.match.status === 'ambiguous') {
      return [preflightIssue('ERROR', 'matching.ambiguous', 'El matching es ambiguo y requiere una elección humana antes de aplicar precios.')];
    }
    if (file.match.status === 'suggestion') {
      return [preflightIssue('ERROR', 'matching.suggestion-review', 'El fuzzy matching es sólo una sugerencia y requiere confirmación humana.')];
    }
    if (file.match.status === 'unmatched') {
      return [preflightIssue('ERROR', 'matching.unmatched', 'No existe un matching confirmado para aplicar precios.')];
    }
    return file.priceIssue === undefined ? [] : [file.priceIssue];
  };

  const onPreflight = async (): Promise<void> => {
    exportResult = null;
    const filePreflights: FilePreflight[] = [];
    for (const file of files.values()) {
      const generation = await runGeneration(file);
      if (disposed) return;
      if (generation === undefined) delete file.generation;
      else file.generation = generation;
      const preflight = buildSvgFilePreflight({
        fileId: file.id,
        fileName: file.fileName,
        result: generation ?? analysisOnlyGeneration(file),
        fonts: currentFontResolutions(file),
        exportIssues: additionalPreflightIssues(file),
      });
      file.preflight = preflight;
      filePreflights.push(preflight);
    }
    model.preflight = { files: filePreflights };
    publish();
  };

  const onMatchApply = (detail: WorkbenchEventMap['pw:match-apply']): void => {
    const target = files.get(detail.fileId);
    if (target === undefined) return;
    const apply = (file: RuntimeFile): void => {
      if (!file.match.candidates.some((candidate) => candidate.id === detail.candidateId)) return;
      matchStore.record(file.id, detail.candidateId);
      recomputeMatch(file);
      delete file.preflight;
      delete file.generation;
    };
    apply(target);
    if (detail.scope === 'batch') {
      for (const file of files.values()) {
        if (file.id !== target.id && fileStem(file.fileName) === fileStem(target.fileName)) apply(file);
      }
    }
    delete model.preflight;
    exportResult = null;
    publish();
  };

  const bundleInput = (file: RuntimeFile) => ({
    fileId: file.id,
    sourceSvg: file.sourceSvg,
    ...(file.generation?.svg === undefined
      ? file.analysis.engineClassification === 'price-absent' || file.analysis.engineClassification === 'already-replaced-editable-price'
        ? { resultSvg: file.sourceSvg }
        : {}
      : { resultSvg: file.generation.svg }),
    outputName: file.fileName,
    trace: fileTrace(file),
    ...(file.preflight === undefined ? {} : { preflight: file.preflight }),
    status: file.generation?.svg !== undefined
      || file.analysis.engineClassification === 'price-absent'
      || file.analysis.engineClassification === 'already-replaced-editable-price'
      ? 'exported' as const
      : 'skipped' as const,
  });

  const deliverExport = (kind: WorkbenchEventMap['pw:export-request']['kind'], format: WorkbenchEventMap['pw:export-request']['manifestFormat'], bundle: ExportBundleResult): void => {
    if (kind === 'zip' || kind === 'batch') {
      triggerDownload('precios-export.zip', bundle.zip, 'application/zip');
      return;
    }
    if (kind === 'file') {
      const artifact = bundle.svgArtifacts[0];
      if (artifact) triggerDownload(artifact.fileName, artifact.content, 'image/svg+xml');
      return;
    }
    const extension = format === 'csv' ? '.csv' : '.json';
    const artifact = bundle.manifests.find((entry) => entry.fileName.endsWith(extension));
    if (artifact) triggerDownload(artifact.fileName, artifact.content, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json');
  };

  const onExport = async (detail: WorkbenchEventMap['pw:export-request']): Promise<void> => {
    const selected = detail.fileIds.map((id) => files.get(id)).filter((file): file is RuntimeFile => file !== undefined);
    const bundle = await buildExportBundle(selected.map(bundleInput), {
      timestamp: new Date().toISOString(),
      provenance: { source: source?.fileName ?? null },
    });
    if (disposed) return;
    deliverExport(detail.kind, detail.manifestFormat, bundle);
    exportResult = {
      status: 'generated',
      kind: detail.kind,
      hashAlgorithm: 'sha256',
      sha256: bundle.zipSha256,
      partial: bundle.partial,
      artifactNames: [
        ...bundle.svgArtifacts.map((artifact) => artifact.fileName),
        ...bundle.manifests.map((artifact) => artifact.fileName),
      ],
    };
    publish();
  };

  const onPreview = (detail: WorkbenchEventMap['pw:preview-command']): void => {
    previewCommand = { fileId: detail.fileId, command: detail.command, zoom: detail.zoom };
  };

  const onIssue = (detail: WorkbenchEventMap['pw:issue-action']): void => {
    const file = files.get(detail.fileId);
    if (file === undefined) return;
    delete file.preflight;
    delete model.preflight;
    publish();
  };

  const reset = (): void => {
    operationRevision += 1;
    source = null;
    files = new Map();
    fileSequence = 0;
    exportResult = null;
    previewCommand = null;
    matchStore.clear();
    fontResolver.dispose();
    model = emptyModel();
    publish();
  };

  const listeners: Array<[keyof WorkbenchEventMap, EventListener]> = [];
  const listen = <Name extends keyof WorkbenchEventMap>(name: Name, handler: (detail: WorkbenchEventMap[Name]) => void | Promise<void>): void => {
    const listener: EventListener = (event) => {
      const task = Promise.resolve(handler((event as CustomEvent<WorkbenchEventMap[Name]>).detail));
      const commandByEvent: Partial<Record<keyof WorkbenchEventMap, PreciosAppCommandName>> = {
        'pw:price-source-files': 'source.load',
        'pw:svg-files': 'svg.load',
        'pw:font-files': 'font.load',
        'pw:match-apply': 'matching.apply',
        'pw:preflight-request': 'preflight.run',
        'pw:issue-action': 'issue.run',
        'pw:export-request': 'export.request',
      };
      const command = commandByEvent[name];
      if (command) track(command, task);
    };
    workbench.addEventListener(name, listener);
    listeners.push([name, listener]);
  };

  listen('pw:price-source-files', onSourceFiles);
  listen('pw:svg-files', onSvgFiles);
  listen('pw:font-files', onFontFiles);
  listen('pw:match-apply', onMatchApply);
  listen('pw:preflight-request', onPreflight);
  listen('pw:preview-command', onPreview);
  listen('pw:issue-action', onIssue);
  listen('pw:export-request', onExport);
  listen('pw:reset-request', reset);

  const controller: AppRuntimeController = {
    snapshot: () => ({
      source: sourceSnapshot(source),
      files: [...files.values()].map((file) => ({
        id: file.id,
        fileName: file.fileName,
        classification: file.analysis.classification,
        engineClassification: file.analysis.engineClassification,
        matchStatus: file.match.status,
        pricing: runtimePriceAlternatives(file),
        preflightBlocking: file.preflight?.blocking ?? null,
        generationStatus: file.generation?.status ?? null,
      })),
      exportResult,
      preview: previewCommand,
    }),
    waitFor: async (command) => {
      const task = pending.get(command);
      if (task) await task;
    },
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      operationRevision += 1;
      for (const [name, listener] of listeners) workbench.removeEventListener(name, listener);
      listeners.length = 0;
      pending.clear();
      stateListeners.clear();
      fontResolver.dispose();
      matchStore.clear();
      if (host[APP_SLOT] === controller) delete host[APP_SLOT];
    },
  };

  host[APP_SLOT] = controller;
  model = emptyModel();
  publish();
  return controller;
}
