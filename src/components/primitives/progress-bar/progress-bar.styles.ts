import { css } from 'lit';

export const progressBarStyles = css`
  :host { display: block; }
  .row { display: flex; justify-content: space-between; gap: var(--pw-space-3); margin-bottom: var(--pw-space-1); color: var(--pw-color-text-muted); font-size: var(--pw-font-size-sm); }
  progress { display: block; width: 100%; height: var(--pw-space-2); accent-color: var(--pw-color-accent); }
`;
