import { css } from 'lit';

export const detailsDrawerStyles = css`
  :host { display: contents; }
  .backdrop { position: fixed; inset: 0; z-index: 40; background: var(--pw-color-overlay); opacity: 0; pointer-events: none; transition: opacity var(--pw-motion-normal) var(--pw-motion-ease); }
  aside { position: fixed; inset: 0 0 0 auto; z-index: 41; width: min(30rem, 92vw); padding: var(--pw-space-5); background: var(--pw-color-surface); box-shadow: var(--pw-shadow-overlay); transform: translateX(102%); transition: transform var(--pw-motion-normal) var(--pw-motion-ease); overflow: auto; color: var(--pw-color-text); }
  :host([open]) .backdrop { opacity: 1; pointer-events: auto; }
  :host([open]) aside { transform: translateX(0); }
  header { display: flex; justify-content: space-between; gap: var(--pw-space-4); align-items: center; margin-bottom: var(--pw-space-4); }
  h2 { margin: 0; font-size: var(--pw-font-size-xl); }
  button { border: var(--pw-border-width) solid var(--pw-color-border); border-radius: var(--pw-radius-sm); background: var(--pw-color-surface); color: var(--pw-color-text); padding: var(--pw-space-2) var(--pw-space-3); cursor: pointer; }
  button:focus-visible, aside:focus-visible { outline: var(--pw-focus-width) solid var(--pw-color-focus); outline-offset: var(--pw-border-width-emphasis); }
  @media (prefers-reduced-motion: reduce) { .backdrop, aside { transition: none; } }
`;
