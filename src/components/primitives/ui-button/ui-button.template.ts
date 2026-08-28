import { html, nothing, type TemplateResult } from 'lit';

export interface UiButtonTemplateState {
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly ariaLabel: string;
}

export function uiButtonTemplate(state: UiButtonTemplateState): TemplateResult {
  return html`<button
    type="button"
    ?disabled=${state.disabled || state.busy}
    aria-busy=${state.busy ? 'true' : 'false'}
    aria-label=${state.ariaLabel || nothing}
  >
    ${state.busy ? html`<span class="busy" aria-hidden="true">…</span>` : nothing}
    <slot name="start"></slot><slot></slot><slot name="end"></slot>
  </button>`;
}
