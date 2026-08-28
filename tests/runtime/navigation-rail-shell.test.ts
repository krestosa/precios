// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkbenchShellTemplate } from '../../src/features/ui/templates/workbench-shell/workbench-shell';

const globalStyles = readFileSync(new URL('../../src/global.css', import.meta.url), 'utf8');
const shellMarkup = readFileSync(new URL('../../src/features/ui/templates/workbench-shell/workbench-shell.html', import.meta.url), 'utf8');
const shellStyles = readFileSync(new URL('../../src/features/ui/templates/workbench-shell/workbench-shell.css', import.meta.url), 'utf8');

function declarationBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = shellStyles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match?.[1]) throw new Error(`No se encontró la regla ${selector}`);
  return match[1];
}

function parsedShell(): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = shellMarkup;
  return template.content.firstElementChild as HTMLElement;
}

describe('M3 Expressive dashboard navigation rail', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('forma un app shell sin margen exterior y con rail de 96px por 100dvh', () => {
    expect(globalStyles).toMatch(/body\s*\{[^}]*min-height:\s*100dvh;[^}]*overflow-x:\s*hidden;/s);
    expect(globalStyles).toMatch(/html, body\s*\{[^}]*margin:\s*0;/s);
    expect(declarationBlock('.app')).toContain('grid-template-columns: 96px minmax(0, 1fr)');
    expect(declarationBlock('.app')).toContain('gap: 0');
    expect(declarationBlock('.app')).toContain('padding: 0');
    const rail = declarationBlock('.rail');
    expect(rail).toContain('top: 0');
    expect(rail).toContain('width: 96px');
    expect(rail).toContain('height: 100dvh');
    expect(rail).toContain('margin: 0');
    expect(rail).toContain('border: 0');
    expect(rail).toContain('border-radius: 0');
  });

  it('aplica las medidas collapsed vigentes: 44/4/64/6/56x32/24 y Label Medium', () => {
    const destinations = declarationBlock('.rail-destinations');
    expect(destinations).toContain('gap: 4px');
    expect(destinations).toContain('padding: 44px 0 16px');
    const item = declarationBlock('.rail-destination');
    expect(item).toContain('height: 64px');
    expect(item).toContain('padding: 6px 0');
    expect(item).toContain('gap: 4px');
    expect(item).toContain('font: var(--pw-type-label-medium)');
    const indicator = declarationBlock('.rail-indicator');
    expect(indicator).toContain('width: 56px');
    expect(indicator).toContain('height: 32px');
    expect(indicator).toContain('border-radius: var(--pw-shape-full)');
    const icon = declarationBlock('.rail-indicator svg');
    expect(icon).toContain('width: 24px');
    expect(icon).toContain('height: 24px');
  });

  it('usa roles de color M3 y state layers 8% hover / 10% focus y pressed', () => {
    expect(globalStyles).toContain('--pw-color-secondary: var(--pw-color-primary)');
    expect(globalStyles).toContain('--pw-color-secondary-container: var(--pw-color-primary-container)');
    expect(globalStyles).toContain('--pw-color-on-secondary-container: var(--pw-color-on-primary-container)');
    expect(declarationBlock('.rail')).toContain('background: var(--pw-color-surface)');
    expect(declarationBlock('.rail-destination')).toContain('color: var(--pw-color-on-surface-variant)');
    expect(declarationBlock('.rail-destination.selected .rail-indicator')).toContain('background: var(--pw-color-secondary-container)');
    expect(declarationBlock('.rail-destination.selected .rail-indicator')).toContain('color: var(--pw-color-on-secondary-container)');
    expect(declarationBlock('.rail-destination.selected .rail-label')).toContain('color: var(--pw-color-secondary)');
    expect(declarationBlock('.rail-destination:hover .rail-indicator::after')).toContain('opacity: 0.08');
    expect(declarationBlock('.rail-destination:focus-visible .rail-indicator::after')).toContain('opacity: 0.10');
    expect(declarationBlock('.rail-destination:active .rail-indicator::after')).toContain('opacity: 0.10');
  });

  it('mantiene rail y dashboard como siblings y reserva el main visual al canvas con inspector lateral', () => {
    const app = parsedShell();
    const children = [...app.children] as HTMLElement[];
    expect(children).toHaveLength(2);
    expect(children[0]?.classList.contains('rail')).toBe(true);
    expect(children[1]?.classList.contains('dashboard')).toBe(true);
    const dashboard = children[1]!;
    const layout = dashboard.querySelector<HTMLElement>('.dashboard-layout')!;
    const results = layout.querySelector<HTMLElement>('#results-section')!;
    const inspector = layout.querySelector<HTMLElement>('#dashboard-inspector')!;
    expect(results.parentElement).toBe(layout);
    expect(results.classList.contains('dashboard-primary')).toBe(true);
    expect(results.querySelector('pw-processed-canvas-template')).not.toBeNull();
    expect(results.querySelector('pw-results-gallery-template')).toBeNull();
    expect(inspector.querySelector('pw-results-gallery-template[compact]')).not.toBeNull();
    expect(declarationBlock('.dashboard-layout')).toContain('grid-template-columns: minmax(0, 1fr) minmax(320px, 380px)');
    expect(declarationBlock('.inspector')).toContain('overflow-y: auto');
  });

  it('acota el inspector responsive al ancho real del dashboard además del viewport', () => {
    expect(shellStyles).toMatch(/@media \(max-width: 899px\)[\s\S]*?\.inspector\s*\{[^}]*width:\s*min\(88vw,\s*380px,\s*100%\)/);
    expect(shellStyles).toMatch(/@media \(max-width: 599px\)[\s\S]*?\.inspector\s*\{[^}]*width:\s*min\(92vw,\s*360px,\s*100%\)/);
  });

  it('expone exactamente cinco destinos verticales con Carga activa inicialmente', () => {
    const app = parsedShell();
    const buttons = [...app.querySelectorAll<HTMLButtonElement>('.rail-destination')];
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Carga', 'Resultados', 'Revisión', 'Validación', 'Exportar']);
    expect(buttons[0]?.classList.contains('selected')).toBe(true);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page');
    expect(shellStyles).not.toContain('flex-direction: row');
  });

  it('actualiza el active state al navegar sin alterar los destinos', () => {
    const shell = new WorkbenchShellTemplate();
    document.body.append(shell);
    const buttons = [...shell.shadowRoot!.querySelectorAll<HTMLButtonElement>('.rail-destination')];
    buttons[1]!.click();
    expect(buttons[0]!.classList.contains('selected')).toBe(false);
    expect(buttons[0]!.hasAttribute('aria-current')).toBe(false);
    expect(buttons[1]!.classList.contains('selected')).toBe(true);
    expect(buttons[1]!.getAttribute('aria-current')).toBe('page');
  });
});
