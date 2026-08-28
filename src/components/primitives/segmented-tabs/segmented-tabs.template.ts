import { html, type TemplateResult } from 'lit';
import type { TabOption } from './segmented-tabs';

export interface SegmentedTabsTemplateState {
  readonly items: readonly TabOption[];
  readonly selected: string;
  readonly label: string;
  readonly onSelect: (id: string) => void;
  readonly onKeyDown: (event: KeyboardEvent, index: number) => void;
}

export function segmentedTabsTemplate(state: SegmentedTabsTemplateState): TemplateResult {
  return html`<div role="tablist" aria-label=${state.label}>
    ${state.items.map((item, index) => html`<button
      type="button"
      role="tab"
      aria-selected=${String(item.id === state.selected)}
      tabindex=${item.id === state.selected ? '0' : '-1'}
      @keydown=${(event: KeyboardEvent) => state.onKeyDown(event, index)}
      @click=${() => state.onSelect(item.id)}
    >${item.label}</button>`)}
  </div>`;
}
