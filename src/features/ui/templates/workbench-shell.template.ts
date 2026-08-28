import { html, nothing, type TemplateResult } from 'lit';
import type { DataListItem, FilesSelectedDetail } from '../../../components';
import type { WorkbenchFileView, WorkbenchViewModel } from '../models';

const STAGES = ['Fuente local', 'SVG', 'Matching', 'Precios', 'Preflight', 'Preview', 'Export'] as const;

export interface WorkbenchShellTemplateState {
  readonly model: WorkbenchViewModel;
  readonly selected: WorkbenchFileView | undefined;
  readonly fileItems: readonly DataListItem[];
  readonly reviewContent: TemplateResult | undefined;
  readonly fontsContent: TemplateResult;
  readonly preflightContent: TemplateResult;
  readonly exportContent: TemplateResult;
  readonly traceContent: TemplateResult | undefined;
  readonly detailsOpen: boolean;
  readonly onPriceSourceFiles: (event: CustomEvent<FilesSelectedDetail>) => void;
  readonly onSvgFiles: (event: CustomEvent<FilesSelectedDetail>) => void;
  readonly onFileActivate: (event: CustomEvent<{ readonly id: string }>) => void;
  readonly onCloseDetails: () => void;
}

export function workbenchShellTemplate(state: WorkbenchShellTemplateState): TemplateResult {
  const xlsEnabled = state.model.source.capabilities.xls;
  return html`<div class="app">
    <header class="topbar">
      <div><p class="eyebrow">Workbench local</p><h1>Actualización de precios en SVG</h1><p class="subtitle">Flujo por etapas para cargar fuentes locales, revisar matching y precios, validar preflight, comparar resultados y exportar sólo los archivos aptos.</p></div>
      <div class="top-actions"><pw-status-chip tone="info" label="Procesamiento local"></pw-status-chip>${state.model.progress ? html`<div class="progress-slot"><pw-progress .value=${state.model.progress.value} .max=${state.model.progress.max} .label=${state.model.progress.label}></pw-progress></div>` : nothing}</div>
    </header>
    <nav class="stages" aria-label="Etapas del flujo">${STAGES.map((stage, index) => html`<div class="stage"><span class="stage-number" aria-hidden="true">${index + 1}</span><span>${stage}</span></div>`)}</nav>

    <pw-workbench-layout>
      <div slot="left" class="stack">
        <pw-panel heading="1. Fuente de precios" description="Carga local; W4 no parsea el archivo.">
          <div class="stack">
            <pw-file-dropzone accept=${`.csv,.xlsx${xlsEnabled ? ',.xls' : ''}`} status=${state.model.source.status} label="Cargar fuente local" helper=${`CSV, XLSX${xlsEnabled ? ', XLS' : ''}`} @files-selected=${state.onPriceSourceFiles}></pw-file-dropzone>
            ${state.model.source.fileName ? html`<div class="small"><strong>${state.model.source.fileName}</strong>${state.model.source.message ? html`<div class="muted">${state.model.source.message}</div>` : nothing}</div>` : nothing}
          </div>
        </pw-panel>

        <pw-panel heading="2. Archivos SVG" description="Admite múltiples archivos y conserva errores de forma aislada.">
          <div class="stack">
            <pw-file-dropzone accept=".svg,image/svg+xml" multiple status=${state.model.svgLoadStatus} label="Cargar SVG" helper="Seleccioná uno o varios archivos SVG" @files-selected=${state.onSvgFiles}></pw-file-dropzone>
            ${state.fileItems.length === 0 ? html`<pw-empty-state heading="Cola vacía" message="Los SVG aparecerán acá cuando el adaptador entregue sus view-models."></pw-empty-state>` : html`<pw-data-list .items=${state.fileItems} label="Cola de SVG" @item-activate=${state.onFileActivate}></pw-data-list>`}
          </div>
        </pw-panel>
        ${state.fontsContent}
      </div>

      <div slot="center" class="stack">${state.selected && state.reviewContent ? state.reviewContent : html`<pw-panel heading="Revisión"><pw-empty-state heading="Sin SVG seleccionados" message="Cargá archivos para habilitar matching, precios, preflight y preview."></pw-empty-state></pw-panel>`}</div>
      <div slot="right" class="stack">${state.preflightContent}${state.exportContent}</div>
    </pw-workbench-layout>

    <pw-details-drawer .open=${state.detailsOpen} heading=${state.selected ? `Provenance · ${state.selected.fileName}` : 'Provenance'} @drawer-close=${state.onCloseDetails}>${state.selected && state.traceContent ? state.traceContent : nothing}</pw-details-drawer>
  </div>`;
}
