export interface PngInspection {
  readonly valid: boolean;
  readonly mimeType: 'image/png' | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface RasterizedPng {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
}

export type SvgPngRasterizer = (svg: string) => Promise<RasterizedPng>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) >>> 0
    | ((bytes[offset + 1] ?? 0) << 16)
    | ((bytes[offset + 2] ?? 0) << 8)
    | (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

export function inspectPng(bytes: Uint8Array): PngInspection {
  const signatureOk = PNG_SIGNATURE.every((value, index) => bytes[index] === value);
  const ihdrOk = bytes.length >= 24
    && bytes[12] === 0x49
    && bytes[13] === 0x48
    && bytes[14] === 0x44
    && bytes[15] === 0x52;
  if (!signatureOk || !ihdrOk) {
    return { valid: false, mimeType: null, width: null, height: null };
  }

  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  return {
    valid: width > 0 && height > 0,
    mimeType: 'image/png',
    width: width > 0 ? width : null,
    height: height > 0 ? height : null,
  };
}

function parseSvgLength(raw: string | null): number | null {
  if (raw === null) return null;
  const match = raw.trim().match(/^([0-9]+(?:\.[0-9]+)?)(?:px)?$/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function declaredSvgDimensions(svg: string): { readonly width: number | null; readonly height: number | null } {
  if (typeof DOMParser === 'undefined') return { width: null, height: null };
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== 'svg' || parsed.querySelector('parsererror') !== null) {
    return { width: null, height: null };
  }

  const width = parseSvgLength(root.getAttribute('width'));
  const height = parseSvgLength(root.getAttribute('height'));
  if (width !== null && height !== null) return { width, height };

  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/u).map(Number) ?? [];
  const viewWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2]! > 0 ? viewBox[2]! : null;
  const viewHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3]! > 0 ? viewBox[3]! : null;
  return { width: width ?? viewWidth, height: height ?? viewHeight };
}

interface LoadedSvgImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  dispose(): void;
}

async function loadSvgImage(blob: Blob): Promise<LoadedSvgImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  }

  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('El navegador no dispone de un decodificador de imagen utilizable para rasterizar SVG.');
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('El navegador no pudo decodificar el SVG procesado.'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('Canvas no produjo bytes PNG.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export const rasterizeSvgToPng: SvgPngRasterizer = async (svg) => {
  if (typeof document === 'undefined') {
    throw new Error('La rasterización PNG requiere un entorno de navegador.');
  }

  const declared = declaredSvgDimensions(svg);
  const loaded = await loadSvgImage(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const width = Math.max(1, Math.round(declared.width ?? loaded.width));
    const height = Math.max(1, Math.round(declared.height ?? loaded.height));
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('El SVG procesado no declara dimensiones rasterizables.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Canvas 2D no está disponible para rasterizar el SVG procesado.');
    context.drawImage(loaded.source, 0, 0, width, height);

    const pngBlob = await canvasPngBlob(canvas);
    if (pngBlob.type !== 'image/png') throw new Error(`Canvas devolvió un MIME inesperado: ${pngBlob.type || 'vacío'}.`);
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const inspection = inspectPng(bytes);
    if (!inspection.valid || inspection.width !== width || inspection.height !== height) {
      throw new Error('La salida de Canvas no es un PNG válido con las dimensiones esperadas.');
    }

    return { bytes, mimeType: 'image/png', width, height };
  } finally {
    loaded.dispose();
  }
};
