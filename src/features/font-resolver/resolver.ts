import type { Diagnostic } from '../../domain/contracts/core';
import type { FontRecord, FontSpec } from '../../domain/contracts/fonts';
import { inspectFontUpload } from './metadata';
import type {
  FontResolution,
  FontResolverSnapshot,
  FontUploadInput,
  InspectedFontUpload,
  RegisteredUploadedFont,
} from './model';

interface UploadEntry extends RegisteredUploadedFont {
  readonly face: FontFace;
}

export interface FontRegistrationResult {
  readonly status: 'registered' | 'rejected';
  readonly inspection: InspectedFontUpload;
  readonly registered?: RegisteredUploadedFont;
  readonly diagnostics: readonly Diagnostic[];
}

function cancelledRegistration(inspection: InspectedFontUpload): FontRegistrationResult {
  return {
    status: 'rejected',
    inspection,
    diagnostics: [
      ...inspection.diagnostics,
      {
        code: 'font.registration-cancelled',
        message: 'El registro tipográfico fue cancelado porque el resolver cambió de ciclo de vida.',
      },
    ],
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function sameFamily(left: FontSpec, right: FontSpec): boolean {
  return normalize(left.family) === normalize(right.family);
}

function matchesSpec(candidate: FontSpec, required: FontSpec): boolean {
  const subfamilyMatches = required.subfamily === undefined
    ? true
    : candidate.subfamily !== undefined && normalize(candidate.subfamily) === normalize(required.subfamily);
  return sameFamily(candidate, required)
    && subfamilyMatches
    && candidate.weight === required.weight
    && normalize(candidate.style) === normalize(required.style);
}

function cssFamily(family: string): string {
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function fontQuery(spec: FontSpec): string {
  return `${spec.style} ${spec.weight} 16px ${cssFamily(spec.family)}`;
}

function familyQuery(spec: FontSpec): string {
  return `16px ${cssFamily(spec.family)}`;
}

function systemCheck(spec: FontSpec): { exact: boolean; family: boolean } {
  if (typeof document === 'undefined' || document.fonts === undefined) return { exact: false, family: false };
  return {
    exact: document.fonts.check(fontQuery(spec)),
    family: document.fonts.check(familyQuery(spec)),
  };
}

export class BrowserFontResolver {
  private readonly uploads = new Map<string, UploadEntry>();
  private lifecycleRevision = 0;

  async registerUpload(input: FontUploadInput): Promise<FontRegistrationResult> {
    const revision = this.lifecycleRevision;
    const inspection = await inspectFontUpload(input);
    if (revision !== this.lifecycleRevision) return cancelledRegistration(inspection);
    const diagnostics: Diagnostic[] = [...inspection.diagnostics];
    if (inspection.spec === undefined) {
      return { status: 'rejected', inspection, diagnostics };
    }
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || document.fonts === undefined) {
      diagnostics.push({
        code: 'font.registration-unavailable',
        message: 'FontFace/document.fonts no está disponible; la fuente no se registró temporalmente.',
      });
      return { status: 'rejected', inspection, diagnostics };
    }

    try {
      const face = new FontFace(inspection.spec.family, input.bytes, {
        style: inspection.spec.style,
        weight: String(inspection.spec.weight),
      });
      await face.load();
      if (revision !== this.lifecycleRevision) return cancelledRegistration(inspection);
      document.fonts.add(face);
      const entry: UploadEntry = {
        id: inspection.meta.id,
        spec: inspection.spec,
        meta: inspection.meta,
        face,
      };
      const previous = this.uploads.get(entry.id);
      if (previous !== undefined) document.fonts.delete(previous.face);
      this.uploads.set(entry.id, entry);
      return {
        status: 'registered',
        inspection,
        registered: { id: entry.id, spec: entry.spec, meta: entry.meta },
        diagnostics,
      };
    } catch (error) {
      diagnostics.push({
        code: 'font.registration-failed',
        message: 'El navegador rechazó el registro temporal de la fuente.',
        details: { reason: error instanceof Error ? error.message : String(error) },
      });
      return { status: 'rejected', inspection, diagnostics };
    }
  }

  resolve(required: FontSpec): FontResolution {
    const exactUpload = [...this.uploads.values()].find((entry) => matchesSpec(entry.spec, required));
    if (exactUpload !== undefined) {
      const record: FontRecord = {
        spec: exactUpload.spec,
        source: 'uploaded',
        status: 'available',
        file: exactUpload.meta,
        diagnostics: [],
      };
      return { status: 'resolved', requested: required, record, diagnostics: [] };
    }

    const system = systemCheck(required);
    if (system.exact) {
      const diagnostics: Diagnostic[] = [{
        code: 'font.system-check-limited',
        message: 'La disponibilidad del sistema se verificó sólo para la familia/variante requerida mediante document.fonts; no se enumeraron fuentes instaladas.',
      }];
      const record: FontRecord = {
        spec: required,
        source: 'system',
        status: 'available',
        diagnostics,
      };
      return { status: 'resolved', requested: required, record, diagnostics };
    }

    const sameFamilyUpload = [...this.uploads.values()].find((entry) => sameFamily(entry.spec, required));
    if (sameFamilyUpload !== undefined || system.family) {
      const diagnostics: Diagnostic[] = [{
        code: 'font.variant-mismatch',
        message: 'Existe evidencia de la familia, pero no de una variante que coincida en subfamilia, peso y estilo.',
      }];
      const record: FontRecord | undefined = sameFamilyUpload === undefined
        ? undefined
        : {
            spec: sameFamilyUpload.spec,
            source: 'uploaded',
            status: 'unavailable',
            file: sameFamilyUpload.meta,
            diagnostics,
          };
      return {
        status: 'mismatch',
        requested: required,
        ...(record === undefined ? {} : { record }),
        diagnostics,
      };
    }

    const diagnostics: Diagnostic[] = [{
      code: 'font.missing',
      message: 'No se encontró una fuente registrada o verificable que coincida con la especificación requerida.',
    }];
    return { status: 'missing', requested: required, diagnostics };
  }

  resolveRequired(required: readonly FontSpec[]): readonly FontResolution[] {
    return required.map((spec) => this.resolve(spec));
  }

  snapshot(required: readonly FontSpec[]): FontResolverSnapshot {
    return {
      required,
      resolutions: this.resolveRequired(required),
      uploads: [...this.uploads.values()].map((entry) => ({
        id: entry.id,
        spec: entry.spec,
        meta: entry.meta,
      })),
    };
  }

  unregisterUpload(id: string): boolean {
    const entry = this.uploads.get(id);
    if (entry === undefined) return false;
    if (typeof document !== 'undefined' && document.fonts !== undefined) document.fonts.delete(entry.face);
    return this.uploads.delete(id);
  }

  dispose(): void {
    this.lifecycleRevision += 1;
    if (typeof document !== 'undefined' && document.fonts !== undefined) {
      for (const entry of this.uploads.values()) document.fonts.delete(entry.face);
    }
    this.uploads.clear();
  }
}