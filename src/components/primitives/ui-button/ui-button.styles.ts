import { css } from 'lit';

export const uiButtonStyles = css`
  :host { display: inline-flex; }
  button {
    min-height: var(--pw-control-height);
    border: var(--pw-border-width) solid var(--pw-color-border);
    border-radius: var(--pw-radius-md);
    padding: var(--pw-space-2) var(--pw-space-3);
    font: var(--pw-font-weight-strong) var(--pw-font-size-md) / var(--pw-line-height-tight) var(--pw-font-family);
    color: var(--pw-color-text);
    background: var(--pw-color-surface);
    cursor: pointer;
    transition: background var(--pw-motion-fast) var(--pw-motion-ease), transform var(--pw-motion-fast) var(--pw-motion-ease);
  }
  button:hover:not(:disabled) { background: var(--pw-color-surface-muted); }
  button:active:not(:disabled) { transform: translateY(var(--pw-border-width)); }
  button:focus-visible { outline: var(--pw-focus-width) solid var(--pw-color-focus); outline-offset: var(--pw-border-width-emphasis); }
  :host([variant='primary']) button { color: var(--pw-color-surface); border-color: var(--pw-color-accent); background: var(--pw-color-accent); }
  :host([variant='primary']) button:hover:not(:disabled) { background: var(--pw-color-accent-strong); }
  :host([variant='ghost']) button { border-color: transparent; background: transparent; }
  :host([variant='danger']) button { color: var(--pw-color-surface); border-color: var(--pw-color-danger); background: var(--pw-color-danger); }
  button:disabled { cursor: not-allowed; opacity: 0.55; }
  .busy { margin-right: var(--pw-space-1); }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
`;
