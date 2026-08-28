import type { MatchResult, PreflightIssue } from '../../../domain/contracts';
import type { WorkbenchViewModel, WorkbenchFileView } from '../models';
import { derivedLayoutIssues } from '../presentation';
import type { WorkbenchUiState } from '../ui-store';
import {
  PRECIOS_APP_CONTROL_VERSION,
  type PreciosAppCommandName,
  type PreciosAppDiagnostics,
  type PreciosAppStateSnapshot,
} from './types';

function selectedFile(model: WorkbenchViewModel, ui: WorkbenchUiState): WorkbenchFileView | undefined {
  return (
    model.files.find((file) => file.id === ui.selectedFileId)
    ?? model.files.find((file) => file.selected)
    ?? model.files[0]
  );
}

function matchMethod(match: MatchResult): string | null {
  return 'method' in match ? match.method : null;
}

function matchConfidence(match: MatchResult): number | null {
  return 'confidence' in match ? match.confidence : null;
}

function currentWarnings(model: WorkbenchViewModel, selected: WorkbenchFileView | undefined): readonly string[] {
  const warnings = new Set<string>();

  if (model.source.message && model.source.status !== 'error') warnings.add(model.source.message);
  model.files.forEach((file) => file.warnings?.forEach((message) => warnings.add(message)));
  if (selected) derivedLayoutIssues(selected).filter((issue) => issue.severity === 'WARNING').forEach((issue) => warnings.add(issue.message));
  if (selected?.preview?.message && selected.preview.status !== 'error') warnings.add(selected.preview.message);

  const preflightIssues: readonly PreflightIssue[] = model.preflight
    ? [...(model.preflight.issues ?? []), ...model.preflight.files.flatMap((file) => file.issues)]
    : [];
  preflightIssues.filter((issue) => issue.severity === 'WARNING').forEach((issue) => warnings.add(issue.message));

  return [...warnings];
}

function currentErrors(model: WorkbenchViewModel, selected: WorkbenchFileView | undefined): readonly string[] {
  const errors = new Set<string>();

  if (model.source.message && model.source.status === 'error') errors.add(model.source.message);
  model.files.forEach((file) => file.errors?.forEach((message) => errors.add(message)));
  if (selected) derivedLayoutIssues(selected).filter((issue) => issue.severity === 'ERROR').forEach((issue) => errors.add(issue.message));
  if (selected?.preview?.message && selected.preview.status === 'error') errors.add(selected.preview.message);

  const preflightIssues: readonly PreflightIssue[] = model.preflight
    ? [...(model.preflight.issues ?? []), ...model.preflight.files.flatMap((file) => file.issues)]
    : [];
  preflightIssues.filter((issue) => issue.severity === 'ERROR').forEach((issue) => errors.add(issue.message));

  return [...errors];
}

export function createPreciosAppState(
  model: WorkbenchViewModel,
  ui: WorkbenchUiState,
  ready: boolean,
  commands: readonly PreciosAppCommandName[],
): PreciosAppStateSnapshot {
  const selected = selectedFile(model, ui);
  const match = selected?.match;
  const preflightIssues = model.preflight
    ? [...(model.preflight.issues ?? []), ...model.preflight.files.flatMap((file) => file.issues)]
    : [];
  const exportableCount = model.files.filter((file) => file.exportable).length;
  const busy =
    model.source.status === 'loading'
    || model.svgLoadStatus === 'loading'
    || model.fontLoadStatus === 'loading'
    || Boolean(model.progress && model.progress.value < model.progress.max);

  return {
    contractVersion: PRECIOS_APP_CONTROL_VERSION,
    ready,
    busy,
    source: {
      status: model.source.status,
      fileName: model.source.fileName ?? null,
      capabilities: { ...model.source.capabilities },
    },
    counts: {
      priceSources: model.source.fileName ? 1 : 0,
      svgFiles: model.files.length,
      fonts: model.fonts.length,
      exportableFiles: exportableCount,
    },
    loads: {
      svgStatus: model.svgLoadStatus,
      fontStatus: model.fontLoadStatus,
    },
    view: {
      selectedFileId: selected?.id ?? null,
      selectedFileName: selected?.fileName ?? null,
      detailsOpen: ui.detailsOpen,
      previewMode: ui.previewMode,
      zoom: ui.zoom,
      matchChoiceByFile: { ...ui.matchChoiceByFile },
    },
    matching: match
      ? {
          status: match.status,
          method: matchMethod(match),
          confidence: matchConfidence(match),
          candidateCount: match.candidates.length,
          selectedCandidateId:
            match.status === 'matched'
              ? match.selected.id
              : selected
                ? ui.matchChoiceByFile[selected.id] ?? null
                : null,
          requiresHuman: match.status === 'suggestion' || match.status === 'ambiguous',
        }
      : null,
    preflight: model.preflight
      ? {
          fileCount: model.preflight.files.length,
          blockingFiles: model.preflight.files.filter((file) => file.blocking).length,
          warnings: preflightIssues.filter((issue) => issue.severity === 'WARNING').length,
          errors: preflightIssues.filter((issue) => issue.severity === 'ERROR').length,
        }
      : null,
    generation: selected?.generation
      ? {
          status: selected.generation.status,
          classification: selected.generation.classification,
          diagnostics: selected.generation.diagnostics.length,
          overflowChecks: selected.generation.overflow.length,
        }
      : null,
    export: {
      exportableCount,
      nonExportableCount: model.files.length - exportableCount,
      selectedFileExportable: selected ? selected.exportable : null,
    },
    warnings: currentWarnings(model, selected),
    errors: currentErrors(model, selected),
    commands: [...commands],
  };
}

export function createPreciosAppDiagnostics(state: PreciosAppStateSnapshot): PreciosAppDiagnostics {
  return {
    contractVersion: PRECIOS_APP_CONTROL_VERSION,
    ready: state.ready,
    busy: state.busy,
    selectedFileId: state.view.selectedFileId,
    sourceStatus: state.source.status,
    svgStatus: state.loads.svgStatus,
    fontStatus: state.loads.fontStatus,
    svgFiles: state.counts.svgFiles,
    fonts: state.counts.fonts,
    exportableFiles: state.counts.exportableFiles,
    previewMode: state.view.previewMode,
    zoom: state.view.zoom,
    warnings: [...state.warnings],
    errors: [...state.errors],
    commands: [...state.commands],
  };
}
