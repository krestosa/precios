import { html, type TemplateResult } from 'lit';
import type { MatchCandidate, PriceField, SourceLoc } from '../../../domain/contracts';
import type { WorkbenchFileView } from '../models';

export interface TraceTemplateState {
  readonly file: WorkbenchFileView;
  readonly formatPrice: (field: PriceField | undefined) => string;
  readonly sourceLocText: (loc: SourceLoc | undefined) => string;
  readonly matchMethodLabel: (method: MatchCandidate['method']) => string;
  readonly confidenceLabel: (confidence: number) => string;
}

function tracePriceTemplate(field: PriceField | undefined, state: TraceTemplateState): TemplateResult {
  if (!field) return html`<span>Desconocido</span>`;
  if (field.state === 'unknown') return html`<span>Desconocido · ${field.reason}${field.provenance ? ` · raw ${String(field.provenance.raw ?? '')}` : ''}</span>`;
  return html`<span>${state.formatPrice(field)} · ${field.provenance.sourceId} · ${state.sourceLocText(field.provenance.loc)} · raw ${String(field.provenance.raw ?? '')}</span>`;
}

export function traceTemplate(state: TraceTemplateState): TemplateResult {
  const trace = state.file.trace;
  if (!trace) return html`<pw-empty-state heading="Trazabilidad no disponible" message="El adaptador todavía no entregó provenance para este archivo."></pw-empty-state>`;
  const locations = trace.sources.flatMap((source) => source.locations.map((loc) => ({ sourceId: source.id, kind: source.kind, loc })));
  return html`<dl class="trace-grid">
    <dt>SVG fuente</dt><dd>${trace.sourceSvg.fileName}</dd>
    <dt>Fuente de precios</dt><dd>${state.file.sourceFileName ?? 'No informada'}</dd>
    <dt>Local raw</dt><dd>${trace.local.raw ?? 'No informado'}</dd>
    <dt>Local canónico</dt><dd>${trace.local.canonical ?? 'No informado'}</dd>
    <dt>Grupo raw</dt><dd>${state.file.rawGroup ?? 'No informado'}</dd>
    <dt>Canal</dt><dd>${state.file.channel ?? 'No informado'}</dd>
    <dt>Método</dt><dd>${trace.match.method ? state.matchMethodLabel(trace.match.method) : 'No informado'}</dd>
    <dt>Confianza</dt><dd>${trace.match.confidence !== undefined ? state.confidenceLabel(trace.match.confidence) : 'No informada'}</dd>
    <dt>Hash SVG</dt><dd>${trace.sourceSvg.hash ?? 'No informado'}</dd>
    <dt>Hash salida</dt><dd>${trace.hash ?? 'No informado'}</dd>
    <dt>ID estable</dt><dd>${trace.stableId ?? 'No informado'}</dd>
    <dt>NORMAL</dt><dd>${tracePriceTemplate(trace.pricing.normal, state)}</dd>
    <dt>ÉMINENT</dt><dd>${tracePriceTemplate(trace.pricing.eminent, state)}</dd>
  </dl>
  <section class="trace-section"><h3>Ubicaciones de fuente</h3>${locations.length === 0 ? html`<span class="small muted">Sin ubicaciones reportadas.</span>` : html`<ul class="trace-list">${locations.map((entry) => html`<li><strong>${entry.sourceId}</strong> · ${entry.kind}<div class="source-location">${state.sourceLocText(entry.loc)}</div></li>`)}</ul>`}</section>
  <section class="trace-section"><h3>Warnings</h3>${trace.warnings.length === 0 ? html`<span class="small muted">Sin warnings.</span>` : html`<ul class="trace-list">${trace.warnings.map((issue) => html`<li>${issue.code} · ${issue.message}</li>`)}</ul>`}</section>
  <section class="trace-section"><h3>Errors</h3>${trace.errors.length === 0 ? html`<span class="small muted">Sin errors.</span>` : html`<ul class="trace-list">${trace.errors.map((issue) => html`<li>${issue.code} · ${issue.message}</li>`)}</ul>`}</section>`;
}
