import { html, type TemplateResult } from 'lit';

export interface DetailsDrawerTemplateState {
  readonly open: boolean;
  readonly heading: string;
  readonly onClose: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

export function detailsDrawerTemplate(state: DetailsDrawerTemplateState): TemplateResult {
  return html`<div class="backdrop" @click=${state.onClose} aria-hidden="true"></div>
    <aside role="dialog" aria-modal="false" aria-label=${state.heading} aria-hidden=${String(!state.open)} tabindex="-1" @keydown=${state.onKeyDown}>
      <header><h2>${state.heading}</h2><button type="button" @click=${state.onClose} aria-label="Cerrar detalles">Cerrar</button></header>
      <slot></slot>
      <slot name="footer"></slot>
    </aside>`;
}
