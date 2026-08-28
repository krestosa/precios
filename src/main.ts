import './tokens/tokens.css';
import './features/ui/workbench';

const appRoot = document.querySelector<HTMLElement>('#app');

if (appRoot === null) {
  throw new Error('No se encontró el contenedor raíz de la aplicación.');
}

let workbench = appRoot.querySelector<HTMLElement>(':scope > pw-price-workbench');

if (workbench === null) {
  workbench = document.createElement('pw-price-workbench');
  appRoot.append(workbench);
}

appRoot.dataset.bootstrap = 'ready';
