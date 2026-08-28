import type { PreviewMode } from './models';

export interface WorkbenchUiState {
  readonly selectedFileId: string | undefined;
  readonly previewMode: PreviewMode;
  readonly zoom: number;
  readonly detailsOpen: boolean;
  readonly matchChoiceByFile: Readonly<Record<string, string>>;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function initialState(): WorkbenchUiState {
  return {
    selectedFileId: undefined,
    previewMode: 'result',
    zoom: 1,
    detailsOpen: false,
    matchChoiceByFile: {},
  };
}

export class WorkbenchUiStore {
  private stateValue: WorkbenchUiState = initialState();

  get state(): WorkbenchUiState {
    return this.stateValue;
  }

  reset(): void {
    this.stateValue = initialState();
  }

  selectFile(fileId: string | undefined): void {
    this.stateValue = { ...this.stateValue, selectedFileId: fileId, detailsOpen: false };
  }

  setPreviewMode(mode: PreviewMode): void {
    this.stateValue = { ...this.stateValue, previewMode: mode };
  }

  zoomIn(): void {
    this.stateValue = { ...this.stateValue, zoom: Math.min(MAX_ZOOM, this.stateValue.zoom + ZOOM_STEP) };
  }

  zoomOut(): void {
    this.stateValue = { ...this.stateValue, zoom: Math.max(MIN_ZOOM, this.stateValue.zoom - ZOOM_STEP) };
  }

  resetZoom(): void {
    this.stateValue = { ...this.stateValue, zoom: 1 };
  }

  setDetailsOpen(open: boolean): void {
    this.stateValue = { ...this.stateValue, detailsOpen: open };
  }

  chooseMatch(fileId: string, candidateId: string): void {
    this.stateValue = {
      ...this.stateValue,
      matchChoiceByFile: { ...this.stateValue.matchChoiceByFile, [fileId]: candidateId },
    };
  }
}
