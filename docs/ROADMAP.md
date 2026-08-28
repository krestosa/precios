# ROADMAP

## Alcance

Este roadmap ordena el desarrollo de la aplicación browser local/offline-first para cargar una fuente local de precios y múltiples SVG, detectar local/archivo, resolver NORMAL y ÉMINENT, previsualizar, ejecutar preflight y exportar SVG actualizados con trazabilidad. Las fases son secuenciales por gates, aunque workers distintos puedan preparar trabajo en paralelo sobre branches separadas. Nada se considera integrado hasta pasar una integración dedicada.

## Fase 0 — Discovery, esquema y assets

### Entradas

- Fuentes de precios reales o muestras representativas.
- SVG reales y fixtures mínimos.
- Requisitos de producto conocidos.

### Outputs

- Inventario de formatos y campos observados.
- Clasificación de SVG: targets editables, ausencia de precio, casos ya reemplazados, split-text defensivo, unknown y casos externos/path-only si aparecen.
- Evidencia sobre tipografías, placeholders y dimensiones de pricing.
- Lista explícita de datos ambiguos o no probados.

### Gate de aceptación

- Se distinguen hechos observados de supuestos.
- `$$$$` queda fijado como NORMAL y `@@@@` como ÉMINENT.
- No se inventa precedencia de precios ni herencia de blancos.
- SALÓN/DELI y NORMAL/ÉMINENT quedan tratados como dimensiones separadas.

### No puede avanzar antes de cerrar

No se puede congelar lógica de precedencia, fallback, interpretación de columnas dudosas ni heurísticas destructivas de SVG sin evidencia suficiente.

## Fase 1 — Arquitectura, contratos y baseline

### Entradas

- Discovery cerrado o con pendientes explícitos.
- Requisitos de separación por módulos y ownership.

### Outputs

- Contratos compartidos de fuente, matching, pricing, SVG, fuentes, preflight, batch y manifest.
- Arquitectura browser/offline-first.
- Estructura de directorios canónica.
- Toolchain baseline estricto y reproducible como base de workers.
- Reglas de ownership, dependency requests y determinismo.

### Gate de aceptación

- Las fronteras W2/W3/W4/W5/W6 están definidas.
- No existe lógica de dominio duplicada en contratos.
- Los contratos representan ausencia/desconocido sin convertirlo en cero o fallback.
- El toolchain puede ser consumido por branches de implementación sin alterar la arquitectura.

### No puede avanzar antes de cerrar

No se debe integrar un core productivo que necesite inventar contratos incompatibles o cruzar ownership sin dependency request.

## Fase 2 — Cores W2 y W3

### Entradas

- Contratos compartidos de Fase 1.
- Evidencia de discovery.

### Outputs W2

- `data-source`: interfaz común para XLSX/XLS/CSV locales y adapters de parsing.
- `matching`: canonical exact -> tokens exactos -> partial inequívoco -> fuzzy sólo sugerencia -> selección manual de sesión.
- `pricing`: resolución explicable sin precedencia inventada.
- Normalización/parsing con trazabilidad de raw/provenance.

### Outputs W3

- Engine SVG con detección segura de targets y soporte defensivo de split-text.
- Font resolver por metadata real para TTF/OTF/WOFF/WOFF2.
- Medición/centrado con métricas reales y detección de overflow.
- Export individual/ZIP y manifests deterministas.
- Preflight e integridad donde corresponda a sus fronteras.

### Gate de aceptación

- No hay fuzzy auto-match.
- Ambigüedad bloquea sólo la decisión afectada y admite selección manual persistente en batch/sesión.
- SVG sólo modifica targets seguros; paths nunca se editan por heurística.
- Fuente del precio se hereda del SVG real y sólo se resuelven familias requeridas.
- `$` separado mantiene family/weight/style y `font-size = price/1.5`.
- Centrado usa métricas reales; overflow se reporta sin reducción silenciosa.
- Outputs equivalentes son deterministas.

### No puede avanzar antes de cerrar

No se puede integrar end-to-end hasta contar con APIs públicas estables y QA mínimo ejecutable de ambos cores. Branch completa no equivale a integración.

## Fase 3 — UI, workbench, tokens y componentes

### Entradas

- Contratos públicos de W2/W3 estables.
- Arquitectura visual canónica.

### Outputs

- Tokens JSON con primitive + semantic y aliases; bridge 1:1 en CSS custom properties.
- Primitives, patterns, layouts y screen-templates en carpetas propias.
- Cada unidad visual con archivos reales `.html + .css + .ts` e `index.ts` cuando corresponda.
- Workbench para carga, matching, preview ORIGINAL/RESULT/OVERLAY, zoom/pan/fit, warnings y preflight.
- Accesibilidad por teclado, focus visible, semántica, reduced-motion y responsive.

### Gate de aceptación

- No existen `.template.ts` ni `.styles.ts` como patrón arquitectónico.
- No existe Sass/SCSS.
- TypeScript no contiene el markup principal ni hojas CSS principales de unidades visuales.
- HTML/CSS estáticos pueden importarse como `?raw`, pero siguen siendo la fuente real de estructura/estilo.
- No hay `innerHTML` con datos de usuario/negocio.
- La UI no reimplementa parsing, matching, pricing ni SVG.
- Shadow DOM es el default de unidades reutilizables; light DOM sólo aparece con justificación explícita.

### No puede avanzar antes de cerrar

No se puede declarar W4 terminado ni integrar la UI mientras existan unidades canónicas con estructura/estilo principal en TypeScript o sin la separación real `.html/.css/.ts`.

## Fase 4 — Integración end-to-end

### Entradas

- W2, W3 y W4 con gates propios cerrados.
- Contratos compatibles.

### Outputs

- Composition root mínimo en `src/main.ts`.
- Adapters de integración en `src/app/**` y/o fronteras acordadas.
- Flujo completo: fuente local -> parsing -> matching -> pricing -> SVG/font -> preflight -> preview -> export.
- Manejo de error por archivo sin bloquear outputs válidos.

### Gate de aceptación

- No se reimplementan módulos durante la integración.
- Los conflictos se resuelven explícitamente y conservando ownership.
- La selección manual de matching se mantiene durante el batch/sesión.
- Preview y manifest reflejan exactamente las decisiones del pipeline.
- Integridad SVG y determinismo superan fixtures mínimos.

### No puede avanzar antes de cerrar

No se debe empaquetar como producto final un flujo con adapters temporales, lógica duplicada, contratos bifurcados o errores críticos sin trazabilidad.

## Fase 5 — Packaging, distribución OS-agnostic y Pages

### Entradas

- Integración end-to-end funcional.
- Scripts npm y toolchain estabilizados.

### Outputs

- Un único handoff copiable fuera del repo y usable sin Git.
- Pipeline portable compartido por Windows, Linux y GitHub Pages.
- `install-build`: instala/valida dependencias, typecheck, tests y build; produce `dist`.
- `run`: sirve únicamente un `dist` ya construido.
- Scripts sustantivos en Node ESM `.mjs`; `.ps1/.bat/.sh` sólo launchers finos.
- Workflow Pages Linux que ensambla el mismo handoff, ejecuta exactamente el mismo pipeline y publica exactamente su `dist`.
- Artifacts de `dist`, handoff y QA/logs/metadata.
- Lockfile canónico generado y validado cuando exista entorno con red apto.

### Gate de aceptación

- El paquete no depende de metadata Git ni de servicios del repositorio.
- Windows y Linux ejecutan los mismos npm scripts y producen outputs equivalentes.
- Pages no mantiene un build paralelo.
- `run` no compila ni instala implícitamente.
- La reproducibilidad está respaldada por lockfile real validado.

### No puede avanzar antes de cerrar

No se declara distribución cerrada sin validación real de npm/lockfile, Windows, Linux y Pages.

## Fase 6 — QA real+sintético, multiplataforma, accesibilidad e integridad

### Entradas

- Flujo integrado y paquete portable.
- Fixtures reales y sintéticos representativos.

### Outputs

- Tests de XLSX/XLS/CSV, datos faltantes/invalidos, duplicados y colisiones.
- Tests de matching exacto, partial inequívoco, fuzzy-suggestion y ambigüedad manual.
- Tests SVG de placeholders simples, split-text, price-absent/unknown, integridad y overflow.
- Tests de fonts por metadata y familias requeridas.
- Tests de export individual, ZIP, manifest JSON/CSV y fallos parciales.
- Comparaciones deterministas repetidas.
- Validación Windows/Linux y del pipeline usado por Pages.
- Auditoría de accesibilidad y responsive.

### Gate de aceptación

- Un error de un SVG no bloquea archivos válidos.
- No hay diferencias no autorizadas en paths, imágenes, viewBox, defs, filters, gradients, patterns ni regiones no-target.
- Los mismos inputs generan el mismo contenido funcional.
- Preflight clasifica `OK/WARNING/ERROR` de manera verificable.
- No quedan fallas críticas de teclado, foco o semántica.

### No puede avanzar antes de cerrar

No se inicia hardening final con fallos críticos o sin cobertura de integridad/determinismo en casos representativos.

## Fase 7 — Hardening, auditoría final, cleanup y deuda cero crítica

### Entradas

- Gates 0–6 cerrados.

### Outputs

- Auditoría final de ownership, arquitectura, contratos y dependencia entre módulos.
- Eliminación de adapters temporales, rutas duplicadas y deuda crítica.
- Validación final de seguridad de datos locales, determinismo, integridad SVG y distribución.
- Inventario explícito de deuda no crítica restante.

### Gate de aceptación

- Cero deuda crítica conocida.
- Cero cambios fuera de ownership no autorizados.
- Cero reglas arquitectónicas canónicas incumplidas.
- Cero divergencias entre pipeline handoff local y Pages.
- Pendientes de producto no probados siguen documentados como no asumidos, no codificados como hechos.

### No puede avanzar antes de cerrar

Esta es la última fase. Si un gate crítico falla, se vuelve a la fase responsable; no se maquilla el resultado como cierre.

## Estado de branches al documentar

Estado observado al crear esta documentación; no implica integración:

- `main`: `3638b33cdd54b3c8c52a5bef1edc931070ed9528`, baseline/contratos W1.
- `build/bootstrap-toolchain`: `295d6e9f4429fdf6850f6885b964088229c1c3f1`.
- `feat/data-pricing-matching`: `bbf6dfd5009683d8bfc44c7ffc6fb6079b26ab76`; core W2 implementado en branch propia.
- `feat/svg-font-export-engine`: `c73713739d8e6910c9e818af930e6856f98f1d69`; core W3 en branch propia, aún requiere QA ejecutable/fixtures.
- `feat/ui-workbench`: `68f5fb6d0f1d49454f9c18f9b283e921b8268e12` al momento de la inspección; sigue en refinamiento estructural y su gate no está cerrado mientras persistan `.template.ts`/`.styles.ts` o equivalentes contrarios a la norma.
- `feat/distribution-handoff`: `cd5528bb5075cd7b68bee102fba74e1eead556fe`; distribución parcial por validación npm real/red/lockfile/Windows/Linux/Pages.

Ninguna de estas branches debe describirse como integrada hasta una integración dedicada con validación de gates.
