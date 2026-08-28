import markup from './trace.html?raw';
import styles from './trace.css?raw';
import '../../../../components';
import { mountStaticShadow, requiredElement } from '../../../../components/shadow';
import type { PriceField } from '../../../../domain/contracts';
import type { WorkbenchFileView } from '../../models';
import { confidenceLabel, formatPrice, matchMethodLabel, sourceLocText } from '../../presentation';

export class TraceTemplate extends HTMLElement {
  private readonly empty: HTMLElement;
  private readonly traceRoot: HTMLElement;
  private readonly locations: HTMLUListElement;
  private readonly warnings: HTMLUListElement;
  private readonly errors: HTMLUListElement;
  private readonly locationsEmpty: HTMLElement;
  private readonly warningsEmpty: HTMLElement;
  private readonly errorsEmpty: HTMLElement;
  private readonly lineTemplate: HTMLTemplateElement;
  private fileValue: WorkbenchFileView | undefined;

  constructor() {
    super();
    const root = mountStaticShadow(this, markup, styles);
    this.empty = requiredElement(root, '.empty');
    this.traceRoot = requiredElement(root, '.trace');
    this.locations = requiredElement(root, '.locations');
    this.warnings = requiredElement(root, '.warnings');
    this.errors = requiredElement(root, '.errors');
    this.locationsEmpty = requiredElement(root, '.locations-empty');
    this.warningsEmpty = requiredElement(root, '.warnings-empty');
    this.errorsEmpty = requiredElement(root, '.errors-empty');
    this.lineTemplate = requiredElement(root, '.line-template');
  }

  set file(value: WorkbenchFileView | undefined) { this.fileValue = value; this.sync(); }
  get file(): WorkbenchFileView | undefined { return this.fileValue; }
  connectedCallback(): void { this.sync(); }

  private setField(name: string, value: string): void { requiredElement<HTMLElement>(this.shadowRoot!, `[data-field="${name}"]`).textContent = value; }
  private priceText(field: PriceField | undefined): string {
    if (!field) return 'Desconocido';
    if (field.state === 'unknown') return `Desconocido · ${field.reason}${field.provenance ? ` · raw ${String(field.provenance.raw ?? '')}` : ''}`;
    return `${formatPrice(field)} · ${field.provenance.sourceId} · ${sourceLocText(field.provenance.loc)} · raw ${String(field.provenance.raw ?? '')}`;
  }
  private fillList(list: HTMLUListElement, values: readonly string[]): void {
    list.replaceChildren();
    values.forEach((value) => {
      const fragment = this.lineTemplate.content.cloneNode(true) as DocumentFragment;
      requiredElement<HTMLElement>(fragment, 'li').textContent = value;
      list.append(fragment);
    });
  }

  private sync(): void {
    const file = this.fileValue;
    const trace = file?.trace;
    this.empty.hidden = Boolean(trace);
    this.traceRoot.hidden = !trace;
    if (!file || !trace) return;
    this.setField('svg', trace.sourceSvg.fileName);
    this.setField('source', file.sourceFileName ?? 'No informada');
    this.setField('source-scope', file.sourceScope === 'generic' ? 'General / genérica' : file.sourceScope === 'local-specific' ? 'Local específica' : 'No informado');
    this.setField('source-local', file.sourceScope === 'generic' ? 'No aplica' : trace.local.raw ?? file.sourceLocal ?? 'No informado');
    this.setField('local-canonical', file.sourceScope === 'generic' ? 'No aplica' : trace.local.canonical ?? 'No informado');
    this.setField('group', file.rawGroup ?? 'No informado');
    this.setField('output-scopes', file.targetScopes?.length ? file.targetScopes.join(' / ') : 'No informado');
    this.setField('channel', file.channel ?? 'No informado');
    this.setField('method', trace.match.method ? matchMethodLabel(trace.match.method) : 'No informado');
    this.setField('confidence', trace.match.confidence !== undefined ? confidenceLabel(trace.match.confidence) : 'No informada');
    this.setField('svg-hash', trace.sourceSvg.hash ?? 'No informado');
    this.setField('output-hash', trace.hash ?? 'No informado');
    this.setField('stable-id', trace.stableId ?? 'No informado');
    this.setField('normal', this.priceText(trace.pricing.normal));
    this.setField('eminent', this.priceText(trace.pricing.eminent));
    const locationLines = trace.sources.flatMap((source) => source.locations.map((loc) => `${source.id} · ${source.kind} · ${sourceLocText(loc)}`));
    this.fillList(this.locations, locationLines);
    this.fillList(this.warnings, trace.warnings.map((issue) => `${issue.code} · ${issue.message}`));
    this.fillList(this.errors, trace.errors.map((issue) => `${issue.code} · ${issue.message}`));
    this.locationsEmpty.textContent = locationLines.length ? '' : 'Sin ubicaciones reportadas.';
    this.warningsEmpty.textContent = trace.warnings.length ? '' : 'Sin warnings.';
    this.errorsEmpty.textContent = trace.errors.length ? '' : 'Sin errors.';
  }
}

if (!customElements.get('pw-trace-template')) customElements.define('pw-trace-template', TraceTemplate);
