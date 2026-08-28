import type { FilesSelectedDetail } from '../../../components';
import type { ExportKind, ManifestUiFormat, MatchApplyScope, PreviewCommand } from '../events';
import type { LayoutIssueKind, PreviewMode } from '../models';

export interface UiTemplateEventMap {
  'ui:source-files': FilesSelectedDetail;
  'ui:svg-files': FilesSelectedDetail;
  'ui:font-files': FilesSelectedDetail;
  'ui:file-activate': { readonly id: string };
  'ui:match-choice': { readonly fileId: string; readonly candidateId: string };
  'ui:match-apply': { readonly fileId: string; readonly candidateId: string; readonly scope: MatchApplyScope };
  'ui:preview-mode': { readonly mode: PreviewMode };
  'ui:preview-command': { readonly fileId: string; readonly command: PreviewCommand };
  'ui:issue-action': { readonly fileId: string; readonly issueId: string; readonly kind: LayoutIssueKind };
  'ui:preflight-request': Record<string, never>;
  'ui:export-request': { readonly kind: ExportKind; readonly fileIds: readonly string[]; readonly manifestFormat?: ManifestUiFormat };
  'ui:details-open': Record<string, never>;
}

export function emitUiTemplateEvent<Name extends keyof UiTemplateEventMap>(target: EventTarget, name: Name, detail: UiTemplateEventMap[Name]): void {
  target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}
