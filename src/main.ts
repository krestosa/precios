const appRoot = document.querySelector<HTMLElement>('#app');

if (appRoot === null) {
  throw new Error('No se encontró el contenedor raíz de la aplicación.');
}

appRoot.dataset.bootstrap = 'ready';
