import { css } from 'lit';

export const statusChipStyles = css`
  :host { display: inline-flex; }
  span { display: inline-flex; align-items: center; gap: var(--pw-space-1); border-radius: var(--pw-radius-pill); padding: var(--pw-space-1) var(--pw-space-2); font: var(--pw-font-weight-strong) var(--pw-font-size-sm) / var(--pw-line-height-tight) var(--pw-font-family); background: var(--pw-color-surface-muted); color: var(--pw-color-text-muted); white-space: nowrap; }
  :host([tone='info']) > span { color: var(--pw-color-info); background: var(--pw-color-info-surface); }
  :host([tone='success']) > span { color: var(--pw-color-success); background: var(--pw-color-success-surface); }
  :host([tone='warning']) > span { color: var(--pw-color-warning); background: var(--pw-color-warning-surface); }
  :host([tone='danger']) > span { color: var(--pw-color-danger); background: var(--pw-color-danger-surface); }
  .mark { font-size: var(--pw-font-size-sm); }
`;
