import type { WorkbenchFileView } from '../../models';

export const LIGHTBOX_MIN_ZOOM = 1;
export const LIGHTBOX_MAX_ZOOM = 6;

export type GalleryStatusKind = 'neutral' | 'processing' | 'ready' | 'blocked' | 'error';

export interface GalleryItemView {
  readonly id: string;
  readonly fileName: string;
  readonly targetLabel: string;
  readonly statusLabel: string;
  readonly statusKind: GalleryStatusKind;
  readonly svg: string | undefined;
  readonly exportable: boolean;
  readonly blocked: boolean;
}

export interface LightboxTransform {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const FIT_LIGHTBOX_TRANSFORM: LightboxTransform = { zoom: 1, panX: 0, panY: 0 };

function targetLabel(file: WorkbenchFileView): string {
  const groups = new Set(
    (file.derivedTargets ?? [])
      .map((target) => target.pricingGroup)
      .filter((group): group is string => Boolean(group)),
  );
  if (groups.size > 0) return [...groups].join(' · ');
  if (file.rawGroup) return file.rawGroup;
  if (file.targetScopes?.length) return file.targetScopes.join(' / ');
  return 'Sin target';
}

export function deriveGalleryItems(files: readonly WorkbenchFileView[]): readonly GalleryItemView[] {
  return files.map((file) => {
    const pricingBlocked = file.derivedTargets?.some((target) => target.blocking) ?? false;
    const blocked = pricingBlocked || file.preflight?.blocking === true;
    const generatedSvg = file.generation?.status === 'generated' ? file.generation.svg : undefined;
    let statusLabel = 'No generado';
    let statusKind: GalleryStatusKind = 'neutral';

    if (file.processingState === 'queued' || file.processingState === 'processing') {
      statusLabel = file.processingState === 'queued' ? 'En cola' : 'Procesando';
      statusKind = 'processing';
    } else if (pricingBlocked) {
      statusLabel = 'Bloqueado por pricing';
      statusKind = 'blocked';
    } else if (file.generation?.status === 'error' || (file.errors?.length ?? 0) > 0) {
      statusLabel = 'Error';
      statusKind = 'error';
    } else if (generatedSvg && file.exportable) {
      statusLabel = 'Exportable';
      statusKind = 'ready';
    } else if (generatedSvg) {
      statusLabel = file.preflight ? 'Generado · no exportable' : 'Generado · pendiente de validación';
      statusKind = blocked ? 'blocked' : 'neutral';
    } else if (blocked || file.generation?.status === 'skipped') {
      statusLabel = 'Bloqueado';
      statusKind = 'blocked';
    } else if (file.processingState === 'warning') {
      statusLabel = 'No generado · advertencias';
      statusKind = 'neutral';
    }

    return {
      id: file.id,
      fileName: file.fileName,
      targetLabel: targetLabel(file),
      statusLabel,
      statusKind,
      svg: generatedSvg,
      exportable: file.exportable === true,
      blocked,
    };
  });
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPan(transform: LightboxTransform, viewportWidth: number, viewportHeight: number): LightboxTransform {
  if (transform.zoom <= LIGHTBOX_MIN_ZOOM) return FIT_LIGHTBOX_TRANSFORM;
  const maxX = Math.max(0, viewportWidth * (transform.zoom - 1) * 0.5);
  const maxY = Math.max(0, viewportHeight * (transform.zoom - 1) * 0.5);
  return {
    zoom: transform.zoom,
    panX: clamp(transform.panX, -maxX, maxX),
    panY: clamp(transform.panY, -maxY, maxY),
  };
}

export function zoomAround(
  transform: LightboxTransform,
  requestedZoom: number,
  anchorX: number,
  anchorY: number,
  viewportWidth: number,
  viewportHeight: number,
): LightboxTransform {
  const zoom = clamp(requestedZoom, LIGHTBOX_MIN_ZOOM, LIGHTBOX_MAX_ZOOM);
  if (zoom === LIGHTBOX_MIN_ZOOM) return FIT_LIGHTBOX_TRANSFORM;
  const ratio = zoom / transform.zoom;
  return clampPan({
    zoom,
    panX: anchorX - (anchorX - transform.panX) * ratio,
    panY: anchorY - (anchorY - transform.panY) * ratio,
  }, viewportWidth, viewportHeight);
}

export function zoomFromWheel(
  transform: LightboxTransform,
  deltaY: number,
  anchorX: number,
  anchorY: number,
  viewportWidth: number,
  viewportHeight: number,
): LightboxTransform {
  const factor = Math.exp(-deltaY * 0.0018);
  return zoomAround(transform, transform.zoom * factor, anchorX, anchorY, viewportWidth, viewportHeight);
}

export function panFromDrag(
  transformAtPointerDown: LightboxTransform,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): LightboxTransform {
  if (transformAtPointerDown.zoom <= LIGHTBOX_MIN_ZOOM) return FIT_LIGHTBOX_TRANSFORM;
  return clampPan({
    zoom: transformAtPointerDown.zoom,
    panX: transformAtPointerDown.panX + deltaX,
    panY: transformAtPointerDown.panY + deltaY,
  }, viewportWidth, viewportHeight);
}
