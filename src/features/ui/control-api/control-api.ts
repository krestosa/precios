import { derivedLayoutIssues } from '../presentation';
import type { PriceWorkbench } from '../workbench';
import { emitUiTemplateEvent } from '../templates/template-events';
import { createPreciosAppDiagnostics, createPreciosAppState } from './state';
import {
  PRECIOS_APP_CONTROL_EVENTS,
  PRECIOS_APP_CONTROL_VERSION,
  type ExportRequestCommandPayload,
  type IssueActionCommandPayload,
  type MatchApplyCommandPayload,
  type MatchChoiceCommandPayload,
  type PreciosAppCommandDescriptor,
  type PreciosAppCommandEventDetail,
  type PreciosAppCommandName,
  type PreciosAppControlApi,
  type PreciosAppControlError,
  type PreciosAppControlErrorCode,
  type PreciosAppControlResult,
  type PreciosAppErrorEventDetail,
  type PreciosAppResultEventDetail,
  type PreciosAppStateListener,
  type PreviewModeCommandPayload,
  type PreviewTargetCommandPayload,
  type SheetSelectCommandPayload,
} from './types';

const COMMANDS: readonly PreciosAppCommandDescriptor[] = [
  { name: 'state.get', payload: 'none' },
  { name: 'flow.reset', payload: 'none' },
  { name: 'source.load', payload: 'files' },
  { name: 'source.selectSheet', payload: 'sheet-select' },
  { name: 'svg.load', payload: 'files' },
  { name: 'font.load', payload: 'files' },
  { name: 'file.select', payload: 'file-id' },
  { name: 'matching.choose', payload: 'match-choice' },
  { name: 'matching.apply', payload: 'match-apply' },
  { name: 'preflight.run', payload: 'none' },
  { name: 'preview.setMode', payload: 'preview-mode' },
  { name: 'preview.fit', payload: 'preview-target' },
  { name: 'preview.zoomIn', payload: 'preview-target' },
  { name: 'preview.zoomOut', payload: 'preview-target' },
  { name: 'preview.reset', payload: 'preview-target' },
  { name: 'issue.run', payload: 'issue-action' },
  { name: 'export.request', payload: 'export-request' },
];

const COMMAND_NAMES = COMMANDS.map((descriptor) => descriptor.name);
const INSTALL_SLOT = '__preciosAppControlV1' as const;

type ControlFailure = { readonly ok: false; readonly error: PreciosAppControlError };
type Validation<T> = { readonly ok: true; readonly value: T } | ControlFailure;

interface InstalledControl {
  readonly api: PreciosAppControlApi;
  dispose(): void;
}

type ControlHost = PriceWorkbench & {
  [INSTALL_SLOT]?: InstalledControl;
};

function fail(
  code: PreciosAppControlErrorCode,
  message: string,
  details?: Readonly<Record<string, string | number | boolean | null>>,
): ControlFailure {
  return details
    ? { ok: false, error: { code, message, details } }
    : { ok: false, error: { code, message } };
}

function invalid<T>(
  message: string,
  details?: Readonly<Record<string, string | number | boolean | null>>,
): Validation<T> {
  const result = fail('invalid-payload', message, details);
  return { ok: false, error: result.error };
}

function accepted(): PreciosAppControlResult<{ readonly accepted: true }> {
  return { ok: true, value: { accepted: true } };
}

function acceptedSheet(sheetName: string): PreciosAppControlResult<{ readonly accepted: true; readonly sheetName: string }> {
  return { ok: true, value: { accepted: true, sheetName } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

function parseFiles(payload: unknown): Validation<readonly File[]> {
  if (!isRecord(payload)) return invalid('Se requiere un objeto con la propiedad files.');
  const input = payload['files'];
  const files = isFile(input)
    ? [input]
    : Array.isArray(input) && input.every(isFile)
      ? input
      : null;

  if (!files || files.length === 0) return invalid('files debe contener al menos un objeto File válido.');
  return { ok: true, value: files };
}

function readRequiredString(payload: unknown, key: string): Validation<string> {
  if (!isRecord(payload)) return invalid(`Se requiere un objeto con ${key}.`);
  const value = payload[key];
  if (typeof value !== 'string' || value.trim().length === 0) return invalid(`${key} debe ser un string no vacío.`);
  return { ok: true, value };
}

function readSheetSelect(payload: unknown): Validation<SheetSelectCommandPayload> {
  const sheetName = readRequiredString(payload, 'sheetName');
  return sheetName.ok ? { ok: true, value: { sheetName: sheetName.value } } : sheetName;
}

function readMatchChoice(payload: unknown): Validation<MatchChoiceCommandPayload> {
  const fileId = readRequiredString(payload, 'fileId');
  if (!fileId.ok) return fileId;
  const candidateId = readRequiredString(payload, 'candidateId');
  if (!candidateId.ok) return candidateId;
  return { ok: true, value: { fileId: fileId.value, candidateId: candidateId.value } };
}

function readMatchApply(payload: unknown): Validation<MatchApplyCommandPayload> {
  const choice = readMatchChoice(payload);
  if (!choice.ok) return choice;
  if (!isRecord(payload)) return invalid('Payload de matching inválido.');
  const scope = payload['scope'];
  if (scope !== 'session' && scope !== 'batch') return invalid('scope debe ser session o batch.');
  return { ok: true, value: { ...choice.value, scope } };
}

function readPreviewMode(payload: unknown): Validation<PreviewModeCommandPayload> {
  if (!isRecord(payload)) return invalid('Se requiere un objeto con mode.');
  const mode = payload['mode'];
  if (mode !== 'original' && mode !== 'result' && mode !== 'overlay') {
    return invalid('mode debe ser original, result u overlay.');
  }
  return { ok: true, value: { mode } };
}

function readPreviewTarget(payload: unknown): Validation<PreviewTargetCommandPayload> {
  if (payload === undefined) return { ok: true, value: {} };
  if (!isRecord(payload)) return invalid('El payload de preview debe ser un objeto.');
  const fileId = payload['fileId'];
  if (fileId === undefined) return { ok: true, value: {} };
  if (typeof fileId !== 'string' || fileId.trim().length === 0) return invalid('fileId debe ser un string no vacío.');
  return { ok: true, value: { fileId } };
}

function readIssueAction(payload: unknown): Validation<IssueActionCommandPayload> {
  const fileId = readRequiredString(payload, 'fileId');
  if (!fileId.ok) return fileId;
  const issueId = readRequiredString(payload, 'issueId');
  if (!issueId.ok) return issueId;
  if (!isRecord(payload)) return invalid('Payload de incidencia inválido.');
  const kind = payload['kind'];
  if (kind !== 'overflow' && kind !== 'alignment' && kind !== 'missing-font') {
    return invalid('kind de incidencia no reconocido.');
  }
  return { ok: true, value: { fileId: fileId.value, issueId: issueId.value, kind } };
}

function readStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.length > 0)) return null;
  return value;
}

function readExportRequest(payload: unknown): Validation<ExportRequestCommandPayload> {
  if (!isRecord(payload)) return invalid('Se requiere un payload de exportación.');
  const kind = payload['kind'];
  if (kind !== 'file' && kind !== 'batch' && kind !== 'zip' && kind !== 'manifest') {
    return invalid('kind de exportación no reconocido.');
  }

  const fileIdsValue = payload['fileIds'];
  const fileIds = fileIdsValue === undefined ? undefined : readStringArray(fileIdsValue);
  if (fileIdsValue !== undefined && fileIds === null) return invalid('fileIds debe ser un array de strings no vacíos.');

  const manifestFormat = payload['manifestFormat'];
  if (kind === 'manifest') {
    if (manifestFormat !== 'json' && manifestFormat !== 'csv') return invalid('manifestFormat debe ser json o csv.');
    return fileIds ? { ok: true, value: { kind, fileIds, manifestFormat } } : { ok: true, value: { kind, manifestFormat } };
  }

  if (manifestFormat !== undefined) return invalid('manifestFormat sólo corresponde a exportación manifest.');
  return fileIds ? { ok: true, value: { kind, fileIds } } : { ok: true, value: { kind } };
}

function isKnownCommand(command: string): command is PreciosAppCommandName {
  return COMMAND_NAMES.some((name) => name === command);
}

function selectedFileId(workbench: PriceWorkbench): string | null {
  const uiId = workbench.uiState.selectedFileId;
  if (uiId && workbench.model.files.some((file) => file.id === uiId)) return uiId;
  return workbench.model.files.find((file) => file.selected)?.id ?? workbench.model.files[0]?.id ?? null;
}

function requireFile(workbench: PriceWorkbench, fileId: string): ControlFailure | null {
  return workbench.model.files.some((file) => file.id === fileId)
    ? null
    : fail('not-found', 'No existe un SVG con ese fileId.', { fileId });
}

function requireCandidate(workbench: PriceWorkbench, fileId: string, candidateId: string): ControlFailure | null {
  const file = workbench.model.files.find((entry) => entry.id === fileId);
  if (!file) return fail('not-found', 'No existe un SVG con ese fileId.', { fileId });
  return file.match?.candidates.some((candidate) => candidate.id === candidateId)
    ? null
    : fail('not-found', 'El candidateId no pertenece al matching observable del archivo.', { fileId, candidateId });
}

function resolvePreviewFile(workbench: PriceWorkbench, payload: unknown): Validation<string> {
  const parsed = readPreviewTarget(payload);
  if (!parsed.ok) return parsed;
  const fileId = parsed.value.fileId ?? selectedFileId(workbench);
  if (!fileId) return { ok: false, error: fail('not-available', 'No hay un SVG seleccionado para controlar el preview.').error };
  const missing = requireFile(workbench, fileId);
  if (missing) return { ok: false, error: missing.error };
  return { ok: true, value: fileId };
}

function dispatchPreview(workbench: PriceWorkbench, payload: unknown, command: 'fit' | 'zoom-in' | 'zoom-out' | 'reset'): PreciosAppControlResult {
  const fileId = resolvePreviewFile(workbench, payload);
  if (!fileId.ok) return { ok: false, error: fileId.error };
  emitUiTemplateEvent(workbench, 'ui:preview-command', { fileId: fileId.value, command });
  return accepted();
}

export function installPreciosAppControl(workbench: PriceWorkbench): () => void {
  const host = workbench as ControlHost;
  host[INSTALL_SLOT]?.dispose();

  let disposed = false;
  let lastSnapshot = '';
  const listeners = new Set<PreciosAppStateListener>();
  const recentControlErrors: string[] = [];

  const getState = () => createPreciosAppState(workbench.model, workbench.uiState, workbench.isConnected && !disposed, COMMAND_NAMES);

  const rememberError = (error: PreciosAppControlError): void => {
    recentControlErrors.push(`${error.code}: ${error.message}`);
    if (recentControlErrors.length > 10) recentControlErrors.shift();
  };

  const publishState = (): void => {
    if (disposed) return;
    const state = getState();
    const serialized = JSON.stringify(state);
    if (serialized === lastSnapshot) return;
    lastSnapshot = serialized;

    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // Un consumidor de diagnóstico no debe romper la interfaz.
      }
    });

    window.dispatchEvent(new CustomEvent(PRECIOS_APP_CONTROL_EVENTS.stateChange, {
      detail: { version: PRECIOS_APP_CONTROL_VERSION, state },
    }));
  };

  const executeCommand = async (command: string, payload?: unknown): Promise<PreciosAppControlResult> => {
    if (disposed || !workbench.isConnected) {
      const result = fail('not-ready', 'La superficie de control no está lista.');
      rememberError(result.error);
      return result;
    }

    if (!isKnownCommand(command)) {
      const result = fail('unknown-command', 'Comando no reconocido.', { command });
      rememberError(result.error);
      return result;
    }

    try {
      let result: PreciosAppControlResult;

      switch (command) {
        case 'state.get':
          result = payload === undefined ? { ok: true, value: getState() } : fail('invalid-payload', 'state.get no acepta payload.');
          break;
        case 'flow.reset':
          if (payload !== undefined) result = fail('invalid-payload', 'flow.reset no acepta payload.');
          else {
            emitUiTemplateEvent(workbench, 'ui:reset', {});
            result = accepted();
          }
          break;
        case 'source.load': {
          const files = parseFiles(payload);
          if (!files.ok) result = { ok: false, error: files.error };
          else {
            emitUiTemplateEvent(workbench, 'ui:source-files', { files: files.value });
            result = accepted();
          }
          break;
        }
        case 'source.selectSheet': {
          const selection = readSheetSelect(payload);
          if (!selection.ok) result = { ok: false, error: selection.error };
          else {
            const sheets = workbench.model.source.sheets ?? [];
            if (sheets.length === 0) {
              result = fail('not-available', 'No hay un workbook abierto con hojas seleccionables.');
            } else if (!sheets.some((sheet) => sheet.name === selection.value.sheetName)) {
              result = fail('not-found', 'La hoja solicitada no existe en el workbook abierto.', { sheetName: selection.value.sheetName });
            } else {
              emitUiTemplateEvent(workbench, 'ui:sheet-select', selection.value);
              result = acceptedSheet(selection.value.sheetName);
            }
          }
          break;
        }
        case 'svg.load': {
          const files = parseFiles(payload);
          if (!files.ok) result = { ok: false, error: files.error };
          else {
            emitUiTemplateEvent(workbench, 'ui:svg-files', { files: files.value });
            result = accepted();
          }
          break;
        }
        case 'font.load': {
          const files = parseFiles(payload);
          if (!files.ok) result = { ok: false, error: files.error };
          else {
            emitUiTemplateEvent(workbench, 'ui:font-files', { files: files.value });
            result = accepted();
          }
          break;
        }
        case 'file.select': {
          const fileId = readRequiredString(payload, 'fileId');
          if (!fileId.ok) result = { ok: false, error: fileId.error };
          else {
            const missing = requireFile(workbench, fileId.value);
            if (missing) result = missing;
            else {
              emitUiTemplateEvent(workbench, 'ui:file-activate', { id: fileId.value });
              result = accepted();
            }
          }
          break;
        }
        case 'matching.choose': {
          const choice = readMatchChoice(payload);
          if (!choice.ok) result = { ok: false, error: choice.error };
          else {
            const missing = requireCandidate(workbench, choice.value.fileId, choice.value.candidateId);
            if (missing) result = missing;
            else {
              emitUiTemplateEvent(workbench, 'ui:match-choice', choice.value);
              result = accepted();
            }
          }
          break;
        }
        case 'matching.apply': {
          const match = readMatchApply(payload);
          if (!match.ok) result = { ok: false, error: match.error };
          else {
            const missing = requireCandidate(workbench, match.value.fileId, match.value.candidateId);
            if (missing) result = missing;
            else {
              emitUiTemplateEvent(workbench, 'ui:match-apply', match.value);
              result = accepted();
            }
          }
          break;
        }
        case 'preflight.run':
          if (payload !== undefined) result = fail('invalid-payload', 'preflight.run no acepta payload.');
          else {
            emitUiTemplateEvent(workbench, 'ui:preflight-request', {});
            result = accepted();
          }
          break;
        case 'preview.setMode': {
          const preview = readPreviewMode(payload);
          if (!preview.ok) result = { ok: false, error: preview.error };
          else {
            emitUiTemplateEvent(workbench, 'ui:preview-mode', preview.value);
            result = accepted();
          }
          break;
        }
        case 'preview.fit':
          result = dispatchPreview(workbench, payload, 'fit');
          break;
        case 'preview.zoomIn':
          result = dispatchPreview(workbench, payload, 'zoom-in');
          break;
        case 'preview.zoomOut':
          result = dispatchPreview(workbench, payload, 'zoom-out');
          break;
        case 'preview.reset':
          result = dispatchPreview(workbench, payload, 'reset');
          break;
        case 'issue.run': {
          const action = readIssueAction(payload);
          if (!action.ok) result = { ok: false, error: action.error };
          else {
            const file = workbench.model.files.find((entry) => entry.id === action.value.fileId);
            const issueExists = file
              ? derivedLayoutIssues(file).some((issue) => issue.id === action.value.issueId && issue.kind === action.value.kind)
              : false;
            if (!file) result = fail('not-found', 'No existe un SVG con ese fileId.', { fileId: action.value.fileId });
            else if (!issueExists) result = fail('not-found', 'La incidencia no está visible para ese archivo.', { fileId: action.value.fileId, issueId: action.value.issueId });
            else {
              emitUiTemplateEvent(workbench, 'ui:issue-action', action.value);
              result = accepted();
            }
          }
          break;
        }
        case 'export.request': {
          const request = readExportRequest(payload);
          if (!request.ok) result = { ok: false, error: request.error };
          else {
            const exportable = workbench.model.files.filter((file) => file.exportable);
            const fileIds = request.value.fileIds ?? exportable.map((file) => file.id);
            const invalidIds = fileIds.filter((fileId) => !exportable.some((file) => file.id === fileId));

            if (fileIds.length === 0) result = fail('not-available', 'No hay archivos exportables.');
            else if (invalidIds.length > 0) result = fail('not-available', 'La exportación sólo admite archivos marcados como exportables.', { invalidCount: invalidIds.length });
            else if (request.value.kind === 'file' && fileIds.length !== 1) result = fail('invalid-payload', 'La exportación file requiere exactamente un fileId.');
            else if (request.value.kind === 'manifest') {
              const manifestFormat = request.value.manifestFormat;
              if (manifestFormat !== 'json' && manifestFormat !== 'csv') {
                result = fail('invalid-payload', 'manifestFormat debe ser json o csv.');
              } else {
                emitUiTemplateEvent(workbench, 'ui:export-request', {
                  kind: 'manifest',
                  fileIds,
                  manifestFormat,
                });
                result = accepted();
              }
            } else {
              emitUiTemplateEvent(workbench, 'ui:export-request', { kind: request.value.kind, fileIds });
              result = accepted();
            }
          }
          break;
        }
        default:
          result = fail('unknown-command', 'Comando no reconocido.', { command });
          break;
      }

      if (!result.ok) rememberError(result.error);
      return result;
    } catch {
      const result = fail('internal-error', 'El comando no pudo completarse.');
      rememberError(result.error);
      return result;
    }
  };

  const api: PreciosAppControlApi = {
    version: PRECIOS_APP_CONTROL_VERSION,
    listCommands: () => COMMANDS.map((descriptor) => ({ ...descriptor })),
    getState,
    getDiagnostics: () => {
      const state = getState();
      const diagnostics = createPreciosAppDiagnostics(state);
      return {
        ...diagnostics,
        errors: [...new Set([...diagnostics.errors, ...recentControlErrors])],
      };
    },
    execute: executeCommand,
    subscribe: (listener) => {
      listeners.add(listener);
      try {
        listener(getState());
      } catch {
        // La suscripción queda activa aunque el primer callback del consumidor falle.
      }
      return () => listeners.delete(listener);
    },
  };

  const dispatchBusError = (detail: PreciosAppErrorEventDetail): void => {
    window.dispatchEvent(new CustomEvent(PRECIOS_APP_CONTROL_EVENTS.error, { detail }));
  };

  const onCommand = (event: CustomEvent<PreciosAppCommandEventDetail>): void => {
    const detail: unknown = event.detail;
    if (!isRecord(detail)) {
      dispatchBusError({
        requestId: 'invalid-request',
        command: 'unknown',
        error: { code: 'invalid-payload', message: 'El evento command requiere un detail válido.' },
      });
      return;
    }

    const requestId = detail['requestId'];
    const command = detail['command'];
    if (typeof requestId !== 'string' || requestId.trim().length === 0 || typeof command !== 'string' || command.trim().length === 0) {
      dispatchBusError({
        requestId: typeof requestId === 'string' && requestId.length > 0 ? requestId : 'invalid-request',
        command: typeof command === 'string' && command.length > 0 ? command : 'unknown',
        error: { code: 'invalid-payload', message: 'requestId y command son obligatorios.' },
      });
      return;
    }

    void executeCommand(command, detail['payload']).then((result) => {
      const resultDetail: PreciosAppResultEventDetail = { requestId, command, result };
      window.dispatchEvent(new CustomEvent(PRECIOS_APP_CONTROL_EVENTS.result, { detail: resultDetail }));
      if (!result.ok) dispatchBusError({ requestId, command, error: result.error });
    });
  };

  const onWorkbenchStateChange = (): void => publishState();

  workbench.addEventListener('pw:state-change', onWorkbenchStateChange);
  window.addEventListener(PRECIOS_APP_CONTROL_EVENTS.command, onCommand);

  const installed: InstalledControl = {
    api,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      workbench.removeEventListener('pw:state-change', onWorkbenchStateChange);
      window.removeEventListener(PRECIOS_APP_CONTROL_EVENTS.command, onCommand);
      listeners.clear();
      if (host[INSTALL_SLOT] === installed) delete host[INSTALL_SLOT];
      if (window.preciosApp === api) delete window.preciosApp;
    },
  };

  host[INSTALL_SLOT] = installed;
  window.preciosApp = api;

  queueMicrotask(() => {
    if (disposed) return;
    window.dispatchEvent(new CustomEvent(PRECIOS_APP_CONTROL_EVENTS.ready, {
      detail: { version: PRECIOS_APP_CONTROL_VERSION, commands: api.listCommands() },
    }));
    publishState();
  });

  return installed.dispose;
}
