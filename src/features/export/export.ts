import { strToU8 } from 'fflate';
import type { FileExportResult, FileExportStatus } from '../../domain/contracts/batch';
import type { FileTrace } from '../../domain/contracts/manifest';
import type { PreflightIssue } from '../../domain/contracts/preflight';
import { sha256Hex } from '../svg-engine/integrity';
import { runZipTask } from '../../workers/zip-task';
import { buildManifestArtifacts, buildManifestDocument } from './manifest';
import type {
  ExportBundleResult,
  ExportFileInput,
  ExportJobMetadata,
  ExportManifestFile,
  SvgExportArtifact,
} from './model';

function exportIssue(code: string, message: string, input: ExportFileInput): PreflightIssue {
  return {
    severity: 'ERROR',
    code,
    message,
    fileId: input.fileId,
    fileName: input.trace.sourceSvg.fileName,
  };
}

function requestedStatus(input: ExportFileInput): FileExportStatus {
  if (input.status !== undefined) return input.status;
  if (input.resultSvg === undefined) return 'error';
  return input.trace.errors.some((issue) => issue.severity === 'ERROR') ? 'error' : 'exported';
}

function traceWithHashes(
  input: ExportFileInput,
  job: ExportJobMetadata,
  sourceHash: string,
  resultHash: string | null,
  extraErrors: readonly PreflightIssue[],
): FileTrace {
  const trace = input.trace;
  return {
    sourceSvg: {
      ...trace.sourceSvg,
      hash: sourceHash,
    },
    local: trace.local,
    match: trace.match,
    pricing: trace.pricing,
    sources: trace.sources,
    ...(trace.font === undefined ? {} : { font: trace.font }),
    warnings: trace.warnings,
    errors: [...trace.errors, ...extraErrors],
    ...(trace.stableId === undefined ? {} : { stableId: trace.stableId }),
    ...(resultHash === null ? {} : { hash: resultHash }),
    timestamp: job.timestamp,
  };
}

function manifestFile(
  input: ExportFileInput,
  status: FileExportStatus,
  trace: FileTrace,
  sourceHash: string,
  resultHash: string | null,
  outputName: string | null,
  job: ExportJobMetadata,
): ExportManifestFile {
  return {
    fileId: input.fileId,
    status,
    sourceFileName: trace.sourceSvg.fileName,
    outputFileName: outputName,
    local: trace.local,
    match: trace.match,
    pricing: {
      normal: trace.pricing.normal ?? null,
      eminent: trace.pricing.eminent ?? null,
      appliedRule: trace.pricing.appliedRule ?? null,
      exception: trace.pricing.exception ?? null,
    },
    provenance: trace.sources,
    font: trace.font ?? null,
    warnings: trace.warnings,
    errors: trace.errors,
    timestamp: job.timestamp,
    hashes: {
      sourceSha256: sourceHash,
      resultSha256: resultHash,
    },
  };
}

export async function buildExportBundle(
  inputs: readonly ExportFileInput[],
  job: ExportJobMetadata,
): Promise<ExportBundleResult> {
  if (job.timestamp.trim() === '') throw new Error('El timestamp del job debe ser provisto explícitamente por el caller.');

  const fileResults: FileExportResult[] = [];
  const svgArtifacts: SvgExportArtifact[] = [];
  const manifestFiles: ExportManifestFile[] = [];

  for (const input of inputs) {
    const sourceHash = await sha256Hex(input.sourceSvg);
    const resultHash = input.resultSvg === undefined ? null : await sha256Hex(input.resultSvg);
    let status = requestedStatus(input);
    const extraErrors: PreflightIssue[] = [];

    if (status === 'exported' && input.resultSvg === undefined) {
      status = 'error';
      extraErrors.push(exportIssue('export.svg-result-missing', 'El archivo fue marcado para exportar pero no contiene SVG resultante.', input));
    }
    if (status === 'exported' && input.trace.errors.some((issue) => issue.severity === 'ERROR')) {
      status = 'error';
      extraErrors.push(exportIssue('export.preflight-blocked', 'El archivo contiene errores de preflight y no se exporta.', input));
    }

    const outputName = status === 'exported'
      ? input.outputName ?? input.trace.sourceSvg.fileName
      : null;
    const trace = traceWithHashes(input, job, sourceHash, resultHash, extraErrors);
    const diagnostics = [...trace.warnings, ...trace.errors];
    fileResults.push({
      fileId: input.fileId,
      inputName: trace.sourceSvg.fileName,
      status,
      ...(outputName === null ? {} : { outputName }),
      trace,
      diagnostics,
    });
    manifestFiles.push(manifestFile(input, status, trace, sourceHash, resultHash, outputName, job));

    if (status === 'exported' && input.resultSvg !== undefined && outputName !== null && resultHash !== null) {
      svgArtifacts.push({ fileName: outputName, content: input.resultSvg, sha256: resultHash });
    }
  }

  const manifestDocument = buildManifestDocument(job, manifestFiles);
  const manifests = buildManifestArtifacts(manifestDocument);
  const zipEntries = [
    ...svgArtifacts.map((artifact) => ({ name: artifact.fileName, bytes: strToU8(artifact.content) })),
    ...manifests.map((artifact) => ({ name: artifact.fileName, bytes: strToU8(artifact.content) })),
  ];
  const zip = runZipTask({ entries: zipEntries });
  const zipSha256 = await sha256Hex(zip);
  const partial = fileResults.some((file) => file.status !== 'exported');

  return {
    files: fileResults,
    svgArtifacts,
    manifests,
    manifestDocument,
    zip,
    zipSha256,
    partial,
  };
}
