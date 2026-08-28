import { css } from 'lit';

export const uiWorkbenchStyles = css`
  :host {
    display: block;
    min-height: 100%;
    box-sizing: border-box;
    color: var(--pw-color-text);
    background: var(--pw-color-canvas);
    font-family: var(--pw-font-family);
  }
  *, *::before, *::after { box-sizing: border-box; }
  .app { min-height: 100%; padding: clamp(var(--pw-space-3), 2vw, var(--pw-space-6)); }
  .topbar { display: flex; justify-content: space-between; gap: var(--pw-space-4); align-items: flex-start; margin-bottom: var(--pw-space-4); }
  .eyebrow { margin: 0 0 var(--pw-space-1); color: var(--pw-color-accent); font-size: var(--pw-font-size-sm); font-weight: var(--pw-font-weight-strong); text-transform: uppercase; letter-spacing: 0.08em; }
  h1 { margin: 0; font-size: var(--pw-font-size-2xl); line-height: var(--pw-line-height-tight); }
  .subtitle { max-width: 48rem; margin: var(--pw-space-2) 0 0; color: var(--pw-color-text-muted); font-size: var(--pw-font-size-md); line-height: var(--pw-line-height-relaxed); }
  .top-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--pw-space-2); align-items: center; }
  .progress-slot { min-width: 12rem; }
  .stages { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(8.5rem, 1fr); gap: var(--pw-space-1); margin: 0 0 var(--pw-space-4); padding: var(--pw-space-2); overflow-x: auto; border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-lg); background: var(--pw-color-surface); }
  .stage { display: flex; align-items: center; gap: var(--pw-space-2); min-width: 0; padding: var(--pw-space-2) var(--pw-space-3); border-radius: var(--pw-radius-md); background: var(--pw-color-canvas); color: var(--pw-color-text-muted); font-size: var(--pw-font-size-sm); font-weight: var(--pw-font-weight-strong); white-space: nowrap; }
  .stage-number { display: grid; place-items: center; flex: 0 0 1.35rem; aspect-ratio: 1; border-radius: var(--pw-radius-pill); color: var(--pw-color-surface); background: var(--pw-color-accent); font-size: var(--pw-font-size-sm); }
  .stack { display: grid; gap: var(--pw-space-3); }
  .row { display: flex; gap: var(--pw-space-3); align-items: center; flex-wrap: wrap; }
  .row-between { display: flex; gap: var(--pw-space-3); align-items: flex-start; justify-content: space-between; }
  .muted { color: var(--pw-color-text-muted); }
  .small { font-size: var(--pw-font-size-sm); line-height: var(--pw-line-height-normal); }
  .filename { min-width: 0; overflow-wrap: anywhere; font-weight: var(--pw-font-weight-strong); }
  .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--pw-space-3); }
  .metric { min-width: 0; padding: var(--pw-space-3); border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-md); background: var(--pw-color-canvas); }
  .metric-label { display: block; margin-bottom: var(--pw-space-1); color: var(--pw-color-text-muted); font-size: var(--pw-font-size-sm); }
  .metric strong { display: block; overflow-wrap: anywhere; font-size: var(--pw-font-size-md); }
  .price-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pw-space-3); }
  .price-card { min-height: 7rem; padding: var(--pw-space-3); border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-md); }
  .price-card h3 { margin: 0 0 var(--pw-space-3); font-size: var(--pw-font-size-sm); }
  .price-value { margin: 0; font-size: var(--pw-font-size-xl); font-weight: var(--pw-font-weight-strong); }
  .unknown { color: var(--pw-color-text-muted); font-size: var(--pw-font-size-lg); }
  .provenance { margin-top: var(--pw-space-2); color: var(--pw-color-text-muted); font-size: var(--pw-font-size-sm); line-height: var(--pw-line-height-normal); overflow-wrap: anywhere; }
  .validation { padding: var(--pw-space-3); border-left: var(--pw-focus-width) solid var(--pw-color-info); background: var(--pw-color-info-surface); font-size: var(--pw-font-size-sm); line-height: var(--pw-line-height-relaxed); }
  .validation.warning { border-color: var(--pw-color-warning); background: var(--pw-color-warning-surface); }
  .match-box { display: grid; gap: var(--pw-space-3); }
  select { width: 100%; min-height: var(--pw-control-height); border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-md); padding: var(--pw-space-2) var(--pw-space-3); color: var(--pw-color-text); background: var(--pw-color-surface); font: inherit; }
  select:focus-visible { outline: var(--pw-focus-width) solid var(--pw-color-focus); outline-offset: var(--pw-border-width-emphasis); }
  .candidate-list, .issue-list, .font-list, .export-list, .preflight-list, .trace-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--pw-space-2); }
  .candidate, .issue, .font-item, .export-item, .preflight-item { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--pw-space-3); padding: var(--pw-space-3); border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-md); }
  .issue-text, .font-text, .export-text { min-width: 0; }
  .issue-text strong, .font-text strong, .export-text strong { display: block; overflow-wrap: anywhere; }
  .preview-toolbar { display: flex; justify-content: space-between; gap: var(--pw-space-3); align-items: center; flex-wrap: wrap; margin-bottom: var(--pw-space-3); }
  .preview-controls { display: flex; gap: var(--pw-space-1); align-items: center; flex-wrap: wrap; }
  .preview-viewport { min-height: 28rem; max-height: 65vh; overflow: auto; border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-md); background: repeating-conic-gradient(var(--pw-color-surface-muted) 0 25%, var(--pw-color-surface) 0 50%) 50% / 18px 18px; cursor: grab; }
  .preview-viewport:active { cursor: grabbing; }
  .preview-content { width: 100%; min-height: 28rem; transform: scale(var(--pw-preview-scale, 1)); transform-origin: top left; transition: transform var(--pw-motion-fast) var(--pw-motion-ease); }
  .preview-content iframe { display: block; width: 100%; min-height: 28rem; border: 0; background: var(--pw-color-surface); }
  .preview-content img { display: block; max-width: none; min-width: 100%; height: auto; }
  .preflight-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--pw-space-2); }
  .trace-grid { display: grid; grid-template-columns: minmax(8rem, 0.8fr) minmax(0, 1.4fr); gap: var(--pw-space-2) var(--pw-space-3); margin: 0; font-size: var(--pw-font-size-sm); }
  .trace-grid dt { color: var(--pw-color-text-muted); }
  .trace-grid dd { margin: 0; overflow-wrap: anywhere; }
  .trace-section { margin-top: var(--pw-space-5); padding-top: var(--pw-space-4); border-top: var(--pw-border-width) solid var(--pw-color-border); }
  .trace-section h3 { margin: 0 0 var(--pw-space-2); font-size: var(--pw-font-size-md); }
  .source-location { font-family: var(--pw-font-family-mono); font-size: var(--pw-font-size-sm); }
  .export-note { margin: 0; line-height: var(--pw-line-height-relaxed); }
  @media (max-width: 38rem) { .topbar { display: grid; } .top-actions { justify-content: flex-start; } .summary-grid, .price-grid, .preflight-summary { grid-template-columns: 1fr; } .preview-viewport, .preview-content, .preview-content iframe { min-height: 20rem; } }
  @media (prefers-reduced-motion: reduce) { .preview-content { transition: none; } }
`;
