import type { FileTrace } from '../../domain/contracts/manifest';
import type { FilePreflight, PreflightIssue } from '../../domain/contracts/preflight';

function issueKey(issue: PreflightIssue): string {
  return `${issue.severity}\u0000${issue.code}\u0000${issue.message}`;
}

function mergeIssues(
  existing: readonly PreflightIssue[],
  incoming: readonly PreflightIssue[],
  severity: 'WARNING' | 'ERROR',
): readonly PreflightIssue[] {
  const seen = new Set(existing.map((issue) => issueKey(issue)));
  const result = [...existing];
  for (const issue of incoming) {
    if (issue.severity !== severity) continue;
    const key = issueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

export function mergeFilePreflightIntoTrace(trace: FileTrace, preflight: FilePreflight | undefined): FileTrace {
  if (preflight === undefined) return trace;
  return {
    ...trace,
    warnings: mergeIssues(trace.warnings, preflight.issues, 'WARNING'),
    errors: mergeIssues(trace.errors, preflight.issues, 'ERROR'),
  };
}

export function validateFilePreflightIdentity(
  fileId: string,
  fileName: string,
  preflight: FilePreflight | undefined,
): readonly PreflightIssue[] {
  if (preflight === undefined) return [];
  if (preflight.fileId === fileId && preflight.fileName === fileName) return [];
  return [{
    severity: 'ERROR',
    code: 'export.preflight-identity-mismatch',
    message: 'El preflight recibido no corresponde al archivo que se intenta exportar.',
    fileId,
    fileName,
    details: {
      receivedFileId: preflight.fileId,
      receivedFileName: preflight.fileName,
    },
  }];
}
