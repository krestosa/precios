(async () => {
  const normalizeText = (value) => (value ?? '').replace(/\s+/gu, ' ').trim();
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const deepElements = (root = document) => {
    const result = [];
    const visit = (parent) => {
      for (const element of Array.from(parent.children)) {
        result.push(element);
        visit(element);
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return result;
  };

  const deepMatches = (selector) => deepElements().filter((element) => element.matches(selector));

  const visibleText = (root = document) => {
    const chunks = [];
    const visit = (node, hidden) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!hidden && node.textContent) chunks.push(node.textContent);
        return;
      }
      const nextHidden = hidden || (node instanceof HTMLElement && node.hidden);
      if (nextHidden) return;
      if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot, false);
      node.childNodes.forEach((child) => visit(child, false));
    };
    visit(root, false);
    return normalizeText(chunks.join(' '));
  };

  const findDropzone = (label) => {
    const dropzone = deepMatches('pw-file-dropzone').find((candidate) => candidate.getAttribute('label') === label);
    assert(dropzone, `No existe el dropzone ${label}.`);
    return dropzone;
  };

  const liveNode = (dropzone) => {
    const node = dropzone.shadowRoot?.querySelector('[aria-live]');
    assert(node, `El dropzone ${dropzone.getAttribute('label')} no expone aria-live.`);
    return node;
  };

  const liveText = (dropzone) => normalizeText(liveNode(dropzone).textContent);

  const selectFiles = (dropzone, files) => {
    const input = dropzone.shadowRoot?.querySelector('input[type="file"]');
    assert(input, `El dropzone ${dropzone.getAttribute('label')} no tiene input público.`);
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch {
      // Fallback sobre el evento público del componente si el navegador no permite construir DataTransfer.
      dropzone.dispatchEvent(new CustomEvent('files-selected', {
        detail: { files },
        bubbles: true,
        composed: true,
      }));
    }
  };

  const queueRowText = (fileName) => {
    const queue = deepMatches('pw-data-list')[0];
    const row = Array.from(queue?.shadowRoot?.querySelectorAll('button') ?? [])
      .find((button) => normalizeText(button.textContent).includes(fileName));
    return normalizeText(row?.textContent);
  };

  const sourceProjection = () => {
    const dropzone = findDropzone('Cargar fuente local');
    const sourceFile = deepMatches('.source-file')[0];
    const sourceName = deepMatches('.source-file strong')[0];
    const sourceMessage = deepMatches('.source-file .message')[0];
    return {
      status: liveText(dropzone),
      fileVisible: Boolean(sourceFile && !sourceFile.hidden),
      fileName: normalizeText(sourceName?.textContent),
      message: normalizeText(sourceMessage?.textContent),
    };
  };

  const assertNoInventedPercentage = () => {
    for (const progress of deepMatches('pw-progress')) {
      if (progress.hidden) continue;
      assert(!/\b\d{1,3}%\b/u.test(visibleText(progress)), 'Se mostró un porcentaje inventado durante progreso indeterminado.');
    }
  };

  const createGate = () => {
    let release = () => undefined;
    const wait = new Promise((resolve) => { release = resolve; });
    return { wait, release };
  };

  const deferredFile = (content, name, type, method) => {
    const file = new File([content], name, { type });
    const gate = createGate();
    const read = file[method].bind(file);
    Object.defineProperty(file, method, {
      configurable: true,
      value: async () => {
        await gate.wait;
        return read();
      },
    });
    return { file, release: gate.release };
  };

  const waitForReady = async () => {
    if (window.preciosApp) return window.preciosApp;
    await new Promise((resolve) => window.addEventListener('precios-app:v1:ready', resolve, { once: true }));
    assert(window.preciosApp, 'ready fue emitido pero window.preciosApp no existe.');
    return window.preciosApp;
  };

  const waitForState = (api, predicate) => new Promise((resolve) => {
    let done = false;
    let unsubscribe = () => undefined;
    const accept = (state) => {
      if (done || !predicate(state)) return;
      done = true;
      unsubscribe();
      resolve(state);
    };
    const stop = api.subscribe(accept);
    unsubscribe = stop;
    if (done) stop();
    else accept(api.getState());
  });

  const evidence = {};

  try {
    const api = await waitForReady();
    assert((await api.execute('flow.reset')).ok, 'No se pudo resetear antes del probe.');

    const sourceDropzone = findDropzone('Cargar fuente local');
    const sourceInitial = sourceProjection();
    assert(liveNode(sourceDropzone).getAttribute('aria-live') === 'polite', 'SOURCE no expone aria-live=polite.');
    const sourceCsv = 'Filtro,Código,Nombre\n,QA001,QA PROBE\n';
    const sourceUpload = deferredFile(sourceCsv, 'qa-browser-source.csv', 'text/csv', 'arrayBuffer');
    const sourceLoading = waitForState(api, (state) => state.source?.status === 'loading');
    selectFiles(sourceDropzone, [sourceUpload.file]);
    await sourceLoading;
    evidence.sourceLoading = sourceProjection();
    assert(JSON.stringify(evidence.sourceLoading) !== JSON.stringify(sourceInitial), 'SOURCE no cambió visualmente al seleccionar archivo.');
    assert(visibleText().includes('qa-browser-source.csv'), 'SOURCE no muestra el filename durante loading.');
    assert(/Cargando/iu.test(liveText(sourceDropzone)), 'SOURCE no anuncia Cargando.');
    assertNoInventedPercentage();

    const sourceReady = waitForState(api, (state) => state.source?.status === 'ready');
    sourceUpload.release();
    await sourceReady;
    evidence.sourceFinal = sourceProjection();
    assert(/Listo/iu.test(evidence.sourceFinal.status), 'SOURCE no termina con feedback Listo.');
    assert(evidence.sourceFinal.fileName === 'qa-browser-source.csv', 'SOURCE perdió el filename al completar.');

    const svgDropzone = findDropzone('Cargar SVG');
    assert(liveNode(svgDropzone).getAttribute('aria-live') === 'polite', 'SVG no expone aria-live=polite.');
    const svgA = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" font-family="Arial" font-size="12">$$$$</text><text x="10" y="40" font-family="Arial" font-size="12">@@@@</text></svg>';
    const svgB = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Sin precio</text></svg>';
    const slowSvg = deferredFile(svgA, 'qa-browser-a.svg', 'image/svg+xml', 'text');
    const secondSvg = new File([svgB], 'qa-browser-b.svg', { type: 'image/svg+xml' });
    const svgLoading = waitForState(api, (state) => state.loads?.svgStatus === 'loading');
    selectFiles(svgDropzone, [slowSvg.file, secondSvg]);
    await svgLoading;
    evidence.svgLoading = {
      live: liveText(svgDropzone),
      rowA: queueRowText('qa-browser-a.svg'),
      rowB: queueRowText('qa-browser-b.svg'),
    };
    assert(/Cargando/iu.test(evidence.svgLoading.live), 'SVG no anuncia Cargando.');
    assert(evidence.svgLoading.rowA.includes('qa-browser-a.svg'), 'SVG A no aparece mientras sigue pendiente.');
    assert(evidence.svgLoading.rowB.includes('qa-browser-b.svg'), 'SVG B queda oculto por el archivo lento.');
    assert(/pendiente|analizando|cargando|procesando|pending|loading/iu.test(evidence.svgLoading.rowA), 'SVG A no expone estado transitorio.');
    assert(/pendiente|analizando|cargando|procesando|pending|loading/iu.test(evidence.svgLoading.rowB), 'SVG B no expone estado transitorio.');
    assertNoInventedPercentage();

    const svgReady = waitForState(api, (state) => state.loads?.svgStatus === 'ready' && state.counts?.svgFiles === 2);
    slowSvg.release();
    await svgReady;
    evidence.svgFinal = {
      live: liveText(svgDropzone),
      rowA: queueRowText('qa-browser-a.svg'),
      rowB: queueRowText('qa-browser-b.svg'),
    };
    assert(/Listo/iu.test(evidence.svgFinal.live), 'SVG no termina en Listo.');
    assert(evidence.svgFinal.rowA.includes('qa-browser-a.svg') && evidence.svgFinal.rowB.includes('qa-browser-b.svg'), 'SVG pierde filas al completar.');

    const fontDropzone = findDropzone('Agregar fuentes locales');
    assert(liveNode(fontDropzone).getAttribute('aria-live') === 'polite', 'FONT no expone aria-live=polite.');
    const fontUpload = deferredFile(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]), 'qa-browser-font.woff2', 'font/woff2', 'arrayBuffer');
    const fontLoading = waitForState(api, (state) => state.loads?.fontStatus === 'loading');
    selectFiles(fontDropzone, [fontUpload.file]);
    await fontLoading;
    evidence.fontLoading = {
      live: liveText(fontDropzone),
      text: visibleText(),
    };
    assert(/Cargando/iu.test(evidence.fontLoading.live), 'FONT no anuncia Cargando.');
    assert(evidence.fontLoading.text.includes('qa-browser-font.woff2'), 'FONT no muestra qué archivo fue aceptado.');
    assertNoInventedPercentage();

    const fontCompleted = waitForState(api, (state) => state.loads?.fontStatus === 'ready' || state.loads?.fontStatus === 'error');
    fontUpload.release();
    await fontCompleted;
    evidence.fontFinal = {
      live: liveText(fontDropzone),
      text: visibleText(),
    };
    assert(/Listo|Error/iu.test(evidence.fontFinal.live), 'FONT no termina con estado observable.');
    assert(
      evidence.fontFinal.text.includes('qa-browser-font.woff2') || /Cargada|Faltante|No coincide|Error/iu.test(evidence.fontFinal.text),
      'FONT pierde todo feedback sin resolución o error visible.',
    );

    assert((await api.execute('flow.reset')).ok, 'flow.reset falló al final del probe.');
    const resetText = visibleText();
    evidence.reset = {
      source: liveText(sourceDropzone),
      svg: liveText(svgDropzone),
      font: liveText(fontDropzone),
      filenamesCleared: !['qa-browser-source.csv', 'qa-browser-a.svg', 'qa-browser-b.svg', 'qa-browser-font.woff2']
        .some((name) => resetText.includes(name)),
    };
    assert(evidence.reset.filenamesCleared, 'reset dejó filenames visibles.');
    assert(/Sin archivos/iu.test(evidence.reset.source), 'SOURCE no volvió a Sin archivos.');
    assert(/Sin archivos/iu.test(evidence.reset.svg), 'SVG no volvió a Sin archivos.');
    assert(/Sin archivos/iu.test(evidence.reset.font), 'FONT no volvió a Sin archivos.');

    const result = { ok: true, evidence };
    window.__preciosUploadVisualProbe = result;
    console.log('[precios upload visual QA]', result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      evidence,
    };
    window.__preciosUploadVisualProbe = result;
    console.error('[precios upload visual QA]', result);
    throw error;
  }
})();
