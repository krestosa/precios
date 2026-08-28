export function mountStaticShadow(host: HTMLElement, markup: string, styles: string): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  if (root.childNodes.length > 0) {
    customElements.upgrade(root);
    return root;
  }

  const style = document.createElement('style');
  style.textContent = styles;
  const template = document.createElement('template');
  // El markup importado es estático y controlado por el repositorio.
  template.innerHTML = markup;
  root.append(style, template.content.cloneNode(true));
  customElements.upgrade(root);
  return root;
}

export function upgradeProperty(host: HTMLElement, propertyName: string): void {
  if (!Object.prototype.hasOwnProperty.call(host, propertyName)) return;
  const record = host as unknown as Record<string, unknown>;
  const value = record[propertyName];
  delete record[propertyName];
  record[propertyName] = value;
}

export function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento requerido no encontrado: ${selector}`);
  return element;
}
