export function mountStaticShadow(host: HTMLElement, markup: string, styles: string): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  if (root.childNodes.length > 0) return root;

  const style = document.createElement('style');
  style.textContent = styles;
  const template = document.createElement('template');
  // El markup importado es estático y controlado por el repositorio.
  template.innerHTML = markup;
  root.append(style, template.content.cloneNode(true));
  return root;
}

export function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento requerido no encontrado: ${selector}`);
  return element;
}
