import './tokens/tokens.css';
import './features/ui/workbench';
import { installAppControlAdapter, installAppRuntimeController } from './app';
import { installPreciosAppControl } from './features/ui/control-api';
import type { PriceWorkbench } from './features/ui/workbench';

const appRoot = document.querySelector<HTMLElement>('#app');

if (appRoot === null) {
  throw new Error('No se encontró el contenedor raíz de la aplicación.');
}

let workbench = appRoot.querySelector<PriceWorkbench>(':scope > pw-price-workbench');

if (workbench === null) {
  workbench = document.createElement('pw-price-workbench') as PriceWorkbench;
  appRoot.append(workbench);
}

installPreciosAppControl(workbench);
const runtime = installAppRuntimeController(workbench);
installAppControlAdapter(workbench, runtime);
appRoot.dataset.bootstrap = 'ready';
