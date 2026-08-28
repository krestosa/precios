import type { LayoutIssueKind } from './models';

export type MatchApplyScope = 'session' | 'batch';
export type PreviewCommand = 'fit' | 'zoom-in' | 'zoom-out' | 'reset';
export type ExportKind = 'batch' | 'file' | 'zip' | 'manifest';
export type ManifestUiFormat = 'json' | 'csv';

export interface WorkbenchEventMap {
  'pw:price-source-files': { readonly files: readonly File[] };
  'pw:svg-files': { readonly files: readonly File[] };
  'pw:font-files': { readonly files: readonly File[] };
  'pw:match-apply': { readonly fileId: string; readonly candidateId: string; readonly scope: MatchApplyScope };
  'pw:preflight-request': { readonly fileIds: readonly string[] };
  'pw:preview-command': { readonly fileId: string; readonly command: PreviewCommand; readonly zoom: number };
  'pw:issue-action': { readonly fileId: string; readonly issueId: string; readonly kind: LayoutIssueKind };
  'pw:export-request': {
    readonly kind: ExportKind;
    readonly fileIds: readonly string[];
    readonly manifestFormat?: ManifestUiFormat;
  };
}

export type WorkbenchEventName = keyof WorkbenchEventMap;

export function dispatchWorkbenchEvent<Name extends WorkbenchEventName>(
  target: EventTarget,
  name: Name,
  detail: WorkbenchEventMap[Name],
): boolean {
  return target.dispatchEvent(
    new CustomEvent<WorkbenchEventMap[Name]>(name, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

declare global {
  interface HTMLElementEventMap {
    'pw:price-source-files': CustomEvent<WorkbenchEventMap['pw:price-source-files']>;
    'pw:svg-files': CustomEvent<WorkbenchEventMap['pw:svg-files']>;
    'pw:font-files': CustomEvent<WorkbenchEventMap['pw:font-files']>;
    'pw:match-apply': CustomEvent<WorkbenchEventMap['pw:match-apply']>;
    'pw:preflight-request': CustomEvent<WorkbenchEventMap['pw:preflight-request']>;
    'pw:preview-command': CustomEvent<WorkbenchEventMap['pw:preview-command']>;
    'pw:issue-action': CustomEvent<WorkbenchEventMap['pw:issue-action']>;
    'pw:export-request': CustomEvent<WorkbenchEventMap['pw:export-request']>;
  }
}
