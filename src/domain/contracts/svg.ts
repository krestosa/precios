import type { Diagnostic } from './core';
import type { FontSpec } from './fonts';

export type SvgClass =
  | 'price-editable'
  | 'price-absent'
  | 'price-already-set'
  | 'split-tspan'
  | 'price-path-only'
  | 'unknown';

export type PricePlaceholder =
  | { readonly kind: 'NORMAL'; readonly literal: '$$$$' }
  | { readonly kind: 'EMINENT'; readonly literal: '@@@@' };

export type SvgLocator =
  | { readonly kind: 'element-id'; readonly value: string }
  | { readonly kind: 'dom-path'; readonly value: string }
  | {
      readonly kind: 'placeholder';
      readonly literal: '$$$$' | '@@@@';
      readonly occurrence: number;
    };

export interface SlotBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly unit?: string;
}

export interface TextStyleDescriptor {
  readonly font: FontSpec;
  readonly fill?: string;
  readonly textAnchor?: string;
  readonly letterSpacing?: string;
  readonly rawAttributes?: Readonly<Record<string, string>>;
}

export interface SvgTargetDescriptor {
  readonly id: string;
  readonly locator: SvgLocator;
  readonly placeholder?: PricePlaceholder;
  readonly slot?: SlotBounds;
  readonly style?: TextStyleDescriptor;
}

export interface OverflowResult {
  readonly status: 'fits' | 'overflow' | 'unknown';
  readonly measuredWidth?: number;
  readonly availableWidth?: number;
  readonly message?: string;
}

export interface AllowedDifference {
  readonly path: string;
  readonly reason: string;
}

export interface IntegrityDescriptor {
  readonly mode: 'structural';
  readonly allowed: readonly AllowedDifference[];
}

export interface IntegrityResult {
  readonly ok: boolean;
  readonly allowedDifferences: readonly AllowedDifference[];
  readonly unexpectedDifferences: readonly string[];
}

export interface SvgGenerationResult {
  readonly status: 'generated' | 'skipped' | 'error';
  readonly classification: SvgClass;
  readonly svg?: string;
  readonly targets: readonly SvgTargetDescriptor[];
  readonly overflow: readonly OverflowResult[];
  readonly integrity?: IntegrityResult;
  readonly diagnostics: readonly Diagnostic[];
}
