import type { TextMeasureRequest, TextMeasurer, TextMeasureResult, TextRunStyle } from './model';

function parseLetterSpacing(value: string | undefined, fontSize: number): number | undefined {
  if (value === undefined || value === 'normal') return 0;
  const trimmed = value.trim();
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:px)?$/i.test(trimmed)) return Number.parseFloat(trimmed);
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)em$/i.test(trimmed)) return Number.parseFloat(trimmed) * fontSize;
  return undefined;
}

function canvasFont(request: TextMeasureRequest): string {
  const family = request.font.family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${request.font.style} ${request.font.weight} ${request.fontSize}px "${family}"`;
}

class CanvasTextMeasurer implements TextMeasurer {
  readonly method = 'canvas' as const;

  constructor(private readonly context: CanvasRenderingContext2D) {}

  measure(request: TextMeasureRequest): TextMeasureResult {
    const spacing = parseLetterSpacing(request.letterSpacing, request.fontSize);
    if (spacing === undefined) {
      return {
        status: 'unavailable',
        method: this.method,
        message: `letter-spacing no soportado para medición segura: ${request.letterSpacing ?? ''}`,
      };
    }

    this.context.font = canvasFont(request);
    this.context.textAlign = 'left';
    this.context.textBaseline = 'alphabetic';
    if ('fontKerning' in this.context) this.context.fontKerning = 'normal';
    const metrics = this.context.measureText(request.text);
    const codePoints = Array.from(request.text).length;
    const width = metrics.width + Math.max(0, codePoints - 1) * spacing;
    return Number.isFinite(width)
      ? { status: 'measured', width, method: this.method }
      : { status: 'unavailable', method: this.method, message: 'Canvas devolvió una métrica no finita.' };
  }
}

class UnavailableTextMeasurer implements TextMeasurer {
  readonly method = 'unavailable' as const;

  measure(): TextMeasureResult {
    return {
      status: 'unavailable',
      method: this.method,
      message: 'Canvas/TextMetrics no está disponible. El engine no aproxima anchos tipográficos.',
    };
  }
}

export function createBrowserTextMeasurer(): TextMeasurer {
  if (typeof document === 'undefined') return new UnavailableTextMeasurer();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  return context === null ? new UnavailableTextMeasurer() : new CanvasTextMeasurer(context);
}

export function parseLetterSpacingForMetrics(value: string | undefined, fontSize: number): number | undefined {
  return parseLetterSpacing(value, fontSize);
}

export function measurePriceUnit(
  value: string,
  style: TextRunStyle,
  measurer: TextMeasurer,
): TextMeasureResult & { readonly prefixSize?: number } {
  if (style.font === undefined || style.fontSize === undefined) {
    return {
      status: 'unavailable',
      method: measurer.method,
      message: 'Falta familia o tamaño de fuente para medir el precio.',
    };
  }

  const prefixSize = style.fontSize / 1.5;
  const prefix = measurer.measure({
    text: '$',
    font: style.font,
    fontSize: prefixSize,
    ...(style.letterSpacing === undefined ? {} : { letterSpacing: style.letterSpacing }),
  });
  const number = measurer.measure({
    text: value,
    font: style.font,
    fontSize: style.fontSize,
    ...(style.letterSpacing === undefined ? {} : { letterSpacing: style.letterSpacing }),
  });
  const interRunSpacing = parseLetterSpacing(style.letterSpacing, style.fontSize);

  if (
    prefix.status !== 'measured'
    || number.status !== 'measured'
    || prefix.width === undefined
    || number.width === undefined
    || interRunSpacing === undefined
  ) {
    return {
      status: 'unavailable',
      method: measurer.method,
      prefixSize,
      message: prefix.message ?? number.message ?? 'No fue posible medir la unidad visual completa.',
    };
  }

  return {
    status: 'measured',
    method: measurer.method,
    width: prefix.width + number.width + interRunSpacing,
    prefixSize,
  };
}

export function measureOriginalPlaceholder(style: TextRunStyle, literal: string, measurer: TextMeasurer): TextMeasureResult {
  if (style.font === undefined || style.fontSize === undefined) {
    return { status: 'unavailable', method: measurer.method, message: 'Faltan métricas tipográficas del placeholder.' };
  }
  return measurer.measure({
    text: literal,
    font: style.font,
    fontSize: style.fontSize,
    ...(style.letterSpacing === undefined ? {} : { letterSpacing: style.letterSpacing }),
  });
}
