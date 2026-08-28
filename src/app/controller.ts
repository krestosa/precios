import type { FilePreflight, PreflightIssue } from '../domain/contracts';
import { reconcilePriceSlots } from '../domain/pricing/reconcile';
import {
  adaptPricingMatrix,
  detectPricingMatrixSchema,
  openLocalWorkbook,
  type LocalWorkbookOpenResult,
  type PricingMatrixAdaptedRow,
  type WorkbookSheetInfo,
} from '../features/data-source';
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
import type { FontView, WorkbookSheetView, WorkbenchFileView } from '../features/ui/models';
import type { PriceWorkbench } from '../features/ui/workbench';
import type { PreciosAppCommandName } from '../features/ui/control-api/types';
import { adaptCsvPricingCompatibility } from './csv-pricing-compat';
import {
  failedFontView,
  failedSvgView,
  fileTrace,
  fileView,
  formatUploadMetadata,
  pendingFontView,
  pendingSvgView,
  registeredFontView,
  resolutionFontView,
  runtimePriceAlternatives,
  sourceReadyMessage,
  sourceSnapshot,
} from './view-model';
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
type UploadCommand = 'source.load' | 'svg.load' | 'font.load';

function diagnosticMessage(code: string, message: string): string {
  return `${code}: ${message}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function workbookSheetView(sheet: WorkbookSheetInfo, previous?: WorkbookSheetView): WorkbookSheetView {
  return {
    name: sheet.name,
    index: sheet.index,
    visibility: sheet.visibility,
    ...(previous?.supportStatus === undefined ? {} : { supportStatus: previous.supportStatus }),
    ...(previous?.message === undefined ? {} : { message: previous.message }),
  };
}

export function installAppRuntimeController(workbench: PriceWorkbench): AppRuntimeController {
  const host = workbench as RuntimeHost;
  host[APP_SLOT]?.dispose();

  let disposed = false;
  let operationRevision = 0;
  let activeUpload: { readonly command: UploadCommand; readonly revision: number } | null = null;
  let source: RuntimeSource | null = null;
  let workbookSession: LocalWorkbookOpenResult | null = null;
  let workbookFile: File | null = null;
  let fileSequence = 0;
  let fontSequence = 0;
  let files = new Map<string, RuntimeFile>();
  let svgOrder: string[] = [];
  let pendingSvgFiles = new Map<string, File>();
  let failedSvgFiles = new Map<string, { readonly file: File; readonly message: string }>();
  let uploadedFontViews = new Map<string, FontView>();
  let exportResult: AppRuntimeSnapshot['exportResult'] = null;
  let previewCommand: AppRuntimeSnapshot['preview'] = null;
  const pending = new Map<PreciosAppCommandName, Promise<void>>();
  const stateListeners = new Set<() => void>();
  const matchStore = new SessionMatchStore('preview-runtime');
  const fontResolver = new BrowserFontResolver();
  let model = emptyModel();

  const composedFileViews = (): WorkbenchFileView[] => {
    const runtimeViews = new Map([...files.values()].map((file) => [file.id, fileView(file, source)] as const));
    if (svgOrder.length === 0) return [...runtimeViews.values()];
    return svgOrder.flatMap((id) => {
      const ready = runtimeViews.get(id);
      if (ready !== undefined) return [ready];
      const pendingFile = pendingSvgFiles.get(id);
      if (pendingFile !== undefined) return [pendingSvgView(id, pendingFile, source)];
      const failed = failedSvgFiles.get(id);
      return failed === undefined ? [] : [failedSvgView(id, failed.file, source, failed.message)];
    });
  };

  const publish = (): void => {
    if (disposed) return;
    model.files = composedFileViews();
    workbench.model = { ...model };
    stateListeners.forEach((listener) => listener());
  };

  const refreshFontModel = (): void => {
    const analyses = [...files.values()].map((file) => file.analysis);
    const required = requiredFontsFromSvgAnalyses(analyses);
    const resolutions = typeof document === 'undefined' || document.fonts === undefined
      ? []
      : fontResolver.resolveRequired(required);
    const merged = new Map<string, FontView>();
    uploadedFontViews.forEach((view) => merged.set(view.id, view));
    resolutions.map(resolutionFontView).forEach((view) => {
      if (!merged.has(view.id)) merged.set(view.id, view);
    });
    model.fonts = [...merged.values()];
  };

  const interruptActiveUpload = (): void => {
    if (activeUpload === null) return;
    if (activeUpload.command === 'source.load' && model.source.status === 'loading') {
      model.source = {
        ...model.source,
        status: 'error',
        message: 'La carga fue interrumpida por una nueva operación.',
      };
    }
    if (activeUpload.command === 'svg.load' && model.svgLoadStatus === 'loading') {
      model.svgLoadStatus = files.size > 0 ? 'ready' : 'error';
      pendingSvgFiles.clear();
    }
    if (activeUpload.command === 'font.load' && model.fontLoadStatus === 'loading') {
      model.fontLoadStatus = uploadedFontViews.size > 0 ? 'ready' : 'error';
    }
    delete model.progress;
  };

  const beginUpload = (command: UploadCommand): number => {
    interruptActiveUpload();
    const revision = ++operationRevision;
    activeUpload = { command, revision };
    return revision;
  };

  const isCurrentUpload = (command: UploadCommand, revision: number): boolean =>
    !disposed && activeUpload?.command === command && activeUpload.revision === revision;

  const finishUpload = (command: UploadCommand, revision: number): void => {
    if (isCurrentUpload(command, revision)) activeUpload = null;
  };

  const track = (command: PreciosAppCommandName, task: Promise<void>): void => {
    const guarded = task.catch((error) => {
      if (disposed) return;
      const message = errorMessage(error);
      if (command === 'source.load') {
        model.source = {
          ...model.source,
          status: 'error',
          message: model.source.message ?? message,
        };
      }
      if (command === 'source.selectSheet') {
        const { selectedSheetSummary: _summary, ...withoutSummary } = model.source;
        model.source = {
          ...withoutSummary,
          status: 'error',
          sheetProcessingState: 'error',
          sheetMessage: `No se pudo procesar la hoja seleccionada: ${message}`,
        };
      }
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
      delete model.progress;
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

  const clearSourceDerived = (): void => {
    source = null;
    exportResult = null;
    matchStore.clear();
    delete model.preflight;
    for (const file of files.values()) {
      file.match = matchName(fileStem(file.fileName), []);
      file.priceAlternatives = [];
      delete file.priceIssue;
      delete file.preflight;
      delete file.generation;
    }
  };

  const sourceErrorMessage = (diagnostics: readonly { readonly code: string; readonly message: string }[], fallback: string): string =>
    diagnostics.map((item) => diagnosticMessage(item.code, item.message)).join(' · ') || fallback;

  const onSourceFiles = async (detail: WorkbenchEventMap['pw:price-source-files']): Promise<void> => {
    const revision = beginUpload('source.load');
    const selected = detail.files[0];
    workbookSession = null;
    workbookFile = null;
    clearSourceDerived();
    delete model.progress;
    model.source = {
      status: 'loading',
      ...(selected === undefined ? {} : { fileName: selected.name }),
      capabilities: { csv: true, xlsx: true, xls: true },
      message: selected === undefined ? 'Procesando selección…' : `Procesando… · ${formatUploadMetadata(selected)}`,
    };
    publish();

    try {
      if (detail.files.length !== 1) {
        model.source = {
          status: 'error',
          capabilities: { csv: true, xlsx: true, xls: true },
          message: 'Error · Debe cargarse exactamente un archivo CSV/XLSX/XLS como fuente de precios.',
        };
        publish();
        return;
      }

      const file = detail.files[0]!;
      const data = await file.arrayBuffer();
      if (!isCurrentUpload('source.load', revision)) return;
      const opened = openLocalWorkbook({ sourceId: `local:${file.name}`, fileName: file.name, data });

      if (opened.status === 'error') {
        model.source = {
          status: 'error',
          fileName: file.name,
          capabilities: { csv: true, xlsx: true, xls: true },
          message: `Error · ${formatUploadMetadata(file)} · ${sourceErrorMessage(opened.diagnostics, 'La fuente no pudo abrirse.')}`,
        };
        publish();
        return;
      }

      if (opened.format === 'workbook') {
        workbookSession = opened;
        workbookFile = file;
        model.source = {
          status: 'ready',
          fileName: file.name,
          capabilities: { csv: true, xlsx: true, xls: true },
          message: `Archivo abierto · ${formatUploadMetadata(file)}`,
          sheets: opened.sheets.map((sheet) => workbookSheetView(sheet)),
          sheetSelectionRequired: true,
          sheetMessage: 'Seleccioná la hoja de datos para continuar.',
        };
        publish();
        return;
      }

      const snapshot = opened.csvSnapshot;
      if (snapshot === undefined || snapshot.status !== 'ready') {
        model.source = {
          status: 'error',
          fileName: file.name,
          capabilities: { csv: true, xlsx: true, xls: true },
          message: `Error · ${formatUploadMetadata(file)} · La fuente CSV no produjo datos utilizables.`,
        };
        publish();
        return;
      }

      const adapted = adaptCsvPricingCompatibility(snapshot);
      if (!adapted.supported) {
        model.source = {
          status: 'error',
          fileName: file.name,
          capabilities: { csv: true, xlsx: true, xls: true },
          message: `Error · ${formatUploadMetadata(file)} · ${sourceErrorMessage(adapted.diagnostics, 'La fuente no contiene una matriz de precios compatible.')}`,
        };
        publish();
        return;
      }

      source = {
        fileName: file.name,
        rows: adapted.rows,
        diagnostics: [...opened.diagnostics, ...adapted.diagnostics],
      };
      model.source = {
        status: 'ready',
        fileName: file.name,
        capabilities: { csv: true, xlsx: true, xls: true },
        message: `${sourceReadyMessage(source)} · ${formatUploadMetadata(file)}`,
      };
      refreshMatching();
      delete model.preflight;
      publish();
    } catch (error) {
      if (!isCurrentUpload('source.load', revision)) return;
      clearSourceDerived();
      model.source = {
        status: 'error',
        ...(selected === undefined ? {} : { fileName: selected.name }),
        capabilities: { csv: true, xlsx: true, xls: true },
        message: `Error · ${selected === undefined ? '' : `${formatUploadMetadata(selected)} · `}${errorMessage(error)}`,
      };
      publish();
      throw error;
    } finally {
      if (isCurrentUpload('source.load', revision)) {
        if (model.source.status === 'loading') {
          model.source = { ...model.source, status: 'error', message: 'Error · La carga terminó sin un resultado observable.' };
          publish();
        }
        finishUpload('source.load', revision);
      }
    }
  };

  const updateSelectedSheetSupport = (
    sheets: readonly WorkbookSheetView[],
    sheetName: string,
    supportStatus: 'supported' | 'unsupported',
    message?: string,
  ): readonly WorkbookSheetView[] => sheets.map((sheet) =>
    sheet.name !== sheetName
      ? sheet
      : {
          ...sheet,
          supportStatus,
          ...(message === undefined ? {} : { message }),
        },
  );

  const onSheetSelect = async (detail: WorkbenchEventMap['pw:sheet-select']): Promise<void> => {
    const session = workbookSession;
    const file = workbookFile;
    const revision = ++operationRevision;
    activeUpload = null;
    if (session === null || session.format !== 'workbook' || file === null) {
      throw new Error('No hay un workbook abierto para seleccionar una hoja.');
    }

    const knownSheet = session.sheets.find((sheet) => sheet.name === detail.sheetName);
    if (knownSheet === undefined) throw new Error(`La hoja ${detail.sheetName} no existe en el workbook abierto.`);

    clearSourceDerived();
    const { selectedSheetSummary: _summary, sheetMessage: _oldSheetMessage, ...sourceWithoutPrevious } = model.source;
    model.source = {
      ...sourceWithoutPrevious,
      status: 'ready',
      fileName: file.name,
      sheets: session.sheets.map((sheet) => workbookSheetView(
        sheet,
        model.source.sheets?.find((candidate) => candidate.name === sheet.name),
      )),
      selectedSheetName: detail.sheetName,
      sheetSelectionRequired: true,
      sheetProcessingState: 'processing',
      sheetMessage: 'Procesando hoja seleccionada…',
    };
    publish();

    await Promise.resolve();
    if (disposed || revision !== operationRevision) return;

    const selected = session.selectSheet(detail.sheetName);
    if (selected.status !== 'ready' || selected.snapshot === undefined) {
      const message = sourceErrorMessage(selected.diagnostics, 'La hoja seleccionada no pudo procesarse.');
      model.source = {
        ...model.source,
        status: 'error',
        sheets: updateSelectedSheetSupport(model.source.sheets ?? [], detail.sheetName, 'unsupported', message),
        sheetProcessingState: 'error',
        sheetMessage: message,
      };
      publish();
      return;
    }

    const sheetInfo = selected.sheet ?? knownSheet;
    const detection = detectPricingMatrixSchema(selected.snapshot, { sheetInfo });
    if (!detection.supported) {
      const message = sourceErrorMessage(detection.diagnostics, 'La hoja seleccionada no contiene una estructura de precios compatible.');
      model.source = {
        ...model.source,
        status: 'error',
        sheets: updateSelectedSheetSupport(model.source.sheets ?? [], detail.sheetName, 'unsupported', message),
        sheetProcessingState: 'error',
        sheetMessage: message,
      };
      publish();
      return;
    }

    const adapted = adaptPricingMatrix(selected.snapshot, { sheetInfo });
    if (!adapted.supported) {
      const message = sourceErrorMessage(adapted.diagnostics, 'La hoja seleccionada no puede adaptarse con seguridad.');
      model.source = {
        ...model.source,
        status: 'error',
        sheets: updateSelectedSheetSupport(model.source.sheets ?? [], detail.sheetName, 'unsupported', message),
        sheetProcessingState: 'error',
        sheetMessage: message,
      };
      publish();
      return;
    }

    source = {
      fileName: file.name,
      rows: adapted.rows,
      diagnostics: [...selected.diagnostics, ...adapted.diagnostics],
    };
    const warnings = adapted.diagnostics
      .filter((diagnostic) => diagnostic.code !== 'DATA_EMINENT_BLOCK_ABSENT')
      .map((diagnostic) => diagnostic.message);
    const eminentGroupCount = detection.sheet.headers.eminentGroups.length > 0
      ? detection.sheet.headers.eminentGroups.length
      : undefined;
    model.source = {
      ...model.source,
      status: 'ready',
      sheets: updateSelectedSheetSupport(model.source.sheets ?? [], detail.sheetName, 'supported'),
      selectedSheetName: detail.sheetName,
      sheetSelectionRequired: true,
      sheetProcessingState: warnings.length > 0 ? 'warning' : 'ready',
      sheetMessage: warnings.length > 0 ? 'Hoja procesada con advertencias visibles.' : 'Hoja procesada correctamente.',
      selectedSheetSummary: {
        rowCount: sheetInfo.rowCount,
        columnCount: sheetInfo.columnCount,
        normalGroupCount: detection.sheet.headers.normalGroups.length,
        ...(eminentGroupCount === undefined ? {} : { eminentGroupCount }),
        ...(warnings.length === 0 ? {} : { warnings }),
      },
      message: `${sourceReadyMessage(source)} · ${formatUploadMetadata(file)}`,
    };
    refreshMatching();
    delete model.preflight;
    publish();
  };

  const onSvgFiles = async (detail: WorkbenchEventMap['pw:svg-files']): Promise<void> => {
    const revision = beginUpload('svg.load');
    exportResult = null;
    model.svgLoadStatus = 'loading';
    delete model.preflight;
    matchStore.clear();
    files = new Map();
    pendingSvgFiles = new Map();
    failedSvgFiles = new Map();
    svgOrder = [];

    const staged = detail.files.map((file) => {
      fileSequence += 1;
      const id = `svg:${fileSequence}:${file.name}`;
      svgOrder.push(id);
      pendingSvgFiles.set(id, file);
      return { id, file };
    });

    if (staged.length > 0) {
      model.progress = { value: 0, max: staged.length, label: `0 de ${staged.length} SVG analizados` };
    } else {
      delete model.progress;
    }
    publish();

    let completed = 0;
    let readyCount = 0;
    let errorCount = 0;

    try {
      if (staged.length === 0) {
        model.svgLoadStatus = 'error';
        publish();
        return;
      }

      for (const entry of staged) {
        if (!isCurrentUpload('svg.load', revision)) return;
        model.progress = {
          value: completed,
          max: staged.length,
          label: `Analizando ${entry.file.name} · ${completed} de ${staged.length} completados`,
        };
        publish();

        try {
          const svg = await entry.file.text();
          if (!isCurrentUpload('svg.load', revision)) return;
          const analysis = analyzeSvg(svg);
          const runtimeFile: RuntimeFile = {
            id: entry.id,
            fileName: entry.file.name,
            sourceSvg: svg,
            analysis,
            match: matchName(fileStem(entry.file.name), priceTargets()),
            priceAlternatives: [],
          };
          resolvePrices(runtimeFile);
          files.set(entry.id, runtimeFile);
          readyCount += 1;
        } catch (error) {
          if (!isCurrentUpload('svg.load', revision)) return;
          errorCount += 1;
          failedSvgFiles.set(entry.id, {
            file: entry.file,
            message: `Error de análisis: ${errorMessage(error)}`,
          });
        } finally {
          if (isCurrentUpload('svg.load', revision)) {
            pendingSvgFiles.delete(entry.id);
            completed += 1;
            refreshFontModel();
            model.progress = {
              value: completed,
              max: staged.length,
              label: `${completed} de ${staged.length} SVG analizados · ${readyCount} listo(s) · ${errorCount} con error`,
            };
            publish();
          }
        }
      }

      if (!isCurrentUpload('svg.load', revision)) return;
      model.svgLoadStatus = readyCount > 0 ? 'ready' : 'error';
      model.progress = {
        value: staged.length,
        max: staged.length,
        label: `${staged.length} SVG · ${readyCount} listo(s) · ${errorCount} con error`,
      };
      refreshFontModel();
      publish();
    } finally {
      if (isCurrentUpload('svg.load', revision)) {
        if (model.svgLoadStatus === 'loading') {
          model.svgLoadStatus = readyCount > 0 ? 'ready' : 'error';
          model.progress = {
            value: completed,
            max: Math.max(staged.length, 1),
            label: `${completed} de ${staged.length} SVG completados · operación finalizada`,
          };
          publish();
        }
        finishUpload('svg.load', revision);
      }
    }
  };

  const currentFontResolutions = (file: RuntimeFile): readonly FontResolution[] => {
    if (typeof document === 'undefined' || document.fonts === undefined) return [];
    const required = requiredFontsFromSvgAnalyses([file.analysis]);
    return fontResolver.resolveRequired(required);
  };

  const onFontFiles = async (detail: WorkbenchEventMap['pw:font-files']): Promise<void> => {
    const revision = beginUpload('font.load');
    model.fontLoadStatus = 'loading';
    const total = detail.files.length;
    let completed = 0;
    let registeredCount = 0;
    let errorCount = 0;
    const staged = detail.files.map((file) => {
      fontSequence += 1;
      const id = `font-upload:${fontSequence}:${file.name}`;
      uploadedFontViews.set(id, pendingFontView(id, file));
      return { id, file };
    });
    if (total > 0) model.progress = { value: 0, max: total, label: `0 de ${total} fuentes procesadas` };
    else delete model.progress;
    refreshFontModel();
    publish();

    try {
      if (total === 0) {
        model.fontLoadStatus = 'error';
        publish();
        return;
      }

      for (const entry of staged) {
        if (!isCurrentUpload('font.load', revision)) return;
        model.progress = {
          value: completed,
          max: total,
          label: `Registrando ${entry.file.name} · ${completed} de ${total} completadas`,
        };
        publish();

        try {
          const bytes = await entry.file.arrayBuffer();
          if (!isCurrentUpload('font.load', revision)) return;
          const result = await fontResolver.registerUpload({ name: entry.file.name, mimeType: entry.file.type, bytes });
          if (!isCurrentUpload('font.load', revision)) return;
          const view = registeredFontView(result);
          uploadedFontViews.delete(entry.id);
          if (view === undefined) {
            errorCount += 1;
            const message = sourceErrorMessage(result.diagnostics, 'La fuente no pudo registrarse.');
            uploadedFontViews.set(entry.id, failedFontView(entry.id, entry.file, message));
          } else {
            registeredCount += 1;
            uploadedFontViews.set(view.id, { ...view, displayName: entry.file.name });
          }
        } catch (error) {
          if (!isCurrentUpload('font.load', revision)) return;
          errorCount += 1;
          uploadedFontViews.set(entry.id, failedFontView(entry.id, entry.file, `Error · ${errorMessage(error)}`));
        } finally {
          if (isCurrentUpload('font.load', revision)) {
            completed += 1;
            refreshFontModel();
            model.progress = {
              value: completed,
              max: total,
              label: `${completed} de ${total} fuentes · ${registeredCount} registrada(s) · ${errorCount} con error`,
            };
            publish();
          }
        }
      }

      if (!isCurrentUpload('font.load', revision)) return;
      refreshFontModel();
      model.fontLoadStatus = errorCount > 0 ? 'error' : 'ready';
      delete model.preflight;
      for (const file of files.values()) delete file.preflight;
      model.progress = {
        value: total,
        max: total,
        label: `${total} fuente(s) · ${registeredCount} registrada(s) · ${errorCount} con error`,
      };
      publish();
    } finally {
      if (isCurrentUpload('font.load', revision)) {
        if (model.fontLoadStatus === 'loading') {
          model.fontLoadStatus = registeredCount > 0 ? 'ready' : 'error';
          publish();
        }
        finishUpload('font.load', revision);
      }
    }
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
    const total = files.size;
    let completed = 0;
    if (total > 0) model.progress = { value: 0, max: total, label: `Preflight 0 de ${total}` };
    publish();
    try {
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
        completed += 1;
        model.preflight = { files: [...filePreflights] };
        if (total > 0) model.progress = { value: completed, max: total, label: `Preflight ${completed} de ${total}` };
        publish();
      }
    } finally {
      if (!disposed && total > 0) {
        model.progress = { value: completed, max: total, label: `Preflight ${completed} de ${total} completado` };
        publish();
      }
    }
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
    activeUpload = null;
    source = null;
    workbookSession = null;
    workbookFile = null;
    files = new Map();
    svgOrder = [];
    pendingSvgFiles = new Map();
    failedSvgFiles = new Map();
    uploadedFontViews = new Map();
    fileSequence = 0;
    fontSequence = 0;
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
        'pw:sheet-select': 'source.selectSheet',
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
  listen('pw:sheet-select', onSheetSelect);
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
      activeUpload = null;
      workbookSession = null;
      workbookFile = null;
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
