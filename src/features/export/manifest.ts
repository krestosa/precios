import type { ManifestArtifact } from '../../domain/contracts/batch';
import type { FileTrace } from '../../domain/contracts/manifest';
import type { ExportManifestDocument, ExportManifestFile, ExportJobMetadata } from './model';
import { csvCell, stableJson } from './stable';

function priceState(value: FileTrace['pricing']['normal']): string {
  return value?.state ?? 'missing';
}

function priceAmount(value: FileTrace['pricing']['normal']): number | null {
  return value?.state === 'known' ? value.amount : null;
}

export function buildManifestDocument(
  job: ExportJobMetadata,
  files: readonly ExportManifestFile[],
): ExportManifestDocument {
  return {
    version: 1,
    job,
    files: [...files].sort((left, right) =>
      left.sourceFileName.localeCompare(right.sourceFileName, 'en') || left.fileId.localeCompare(right.fileId, 'en')),
  };
}

function buildCsv(document: ExportManifestDocument): string {
  const header = [
    'file_id',
    'status',
    'source_filename',
    'output_filename',
    'local_raw',
    'local_canonical',
    'match_method',
    'match_confidence',
    'normal_state',
    'normal_amount',
    'eminent_state',
    'eminent_amount',
    'font_family',
    'font_weight',
    'font_style',
    'warning_codes',
    'error_codes',
    'source_sha256',
    'result_sha256',
    'timestamp',
  ];
  const rows = document.files.map((file) => [
    file.fileId,
    file.status,
    file.sourceFileName,
    file.outputFileName,
    file.local.raw,
    file.local.canonical,
    file.match.method,
    file.match.confidence,
    priceState(file.pricing.normal ?? undefined),
    priceAmount(file.pricing.normal ?? undefined),
    priceState(file.pricing.eminent ?? undefined),
    priceAmount(file.pricing.eminent ?? undefined),
    file.font?.family,
    file.font?.weight,
    file.font?.style,
    file.warnings.map((issue) => issue.code).join('|'),
    file.errors.map((issue) => issue.code).join('|'),
    file.hashes.sourceSha256,
    file.hashes.resultSha256,
    file.timestamp,
  ]);
  return `${[header, ...rows].map((row) => row.map((value) => csvCell(value)).join(',')).join('\n')}\n`;
}

export function buildManifestArtifacts(document: ExportManifestDocument): readonly ManifestArtifact[] {
  return [
    {
      format: 'json',
      fileName: 'manifest.json',
      content: stableJson(document),
    },
    {
      format: 'csv',
      fileName: 'manifest.csv',
      content: buildCsv(document),
    },
  ];
}
