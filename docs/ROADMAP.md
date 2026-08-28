# ROADMAP

## Alcance

Este roadmap ordena el desarrollo de la aplicación browser local/offline-first para cargar una fuente local de precios y múltiples SVG, detectar local/archivo, resolver NORMAL y ÉMINENT, previsualizar, ejecutar preflight y exportar SVG actualizados con trazabilidad. Las fases son secuenciales por gates, aunque workers distintos puedan preparar trabajo en paralelo sobre branches separadas. Nada se considera integrado hasta pasar una integración dedicada.

`src/domain/contracts/**` es la ubicación canónica y estable de contratos compartidos durante todo el roadmap. No existe una fase de migración a otra ruta.

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

- Contratos compartidos en `src/domain/contracts/**` para fuente, matching, pricing, SVG, fuentes, preflight, batch y manifest.
- Arquitectura browser/offline-first.
- Estructura de directorios canónica.
- Toolchain baseline estricto y reproducible como base de workers.
- Reglas de ownership, dependency requests y determinismo.
- Arquitectura canónica de design tokens con fuente JSON única y capas `foundation.*`, `semantic.*`, `component.*`.

### Gate de aceptación

- Las fronteras W2/W3/W4/W5/W6 están definidas.
- `src/domain/contracts/**` es una sola fuente de verdad y no existe contrato duplicado en otra ruta.
- No existe lógica de dominio duplicada en contratos.
- Los contratos representan ausencia/desconocido sin convertirlo en cero o fallback.
- El toolchain puede ser consumido por branches de implementación sin alterar la arquitectura.
- La doctrina de tokens define forma JSON, aliases, tipos, catálogo mínimo y bridge CSS verificable.

### No puede avanzar antes de cerrar

No se debe integrar un core productivo que necesite inventar contratos incompatibles, mover imports de contratos sin beneficio funcional o cruzar ownership sin dependency request.

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
- Doctrina completa de tokens definida en `docs/ARCHITECTURE.md` y `docs/DEVELOPMENT_RULES.md`.

### Outputs

- `src/tokens/tokens.json` como única fuente de verdad.
- `src/tokens/tokens.css` generado/validado como bridge CSS 1:1.
- Validator/schema opcional sin duplicación de valores.
- Catálogo completo `foundation.*` + `semantic.*`.
- `component.<name>` exhaustivo para cada primitive/pattern/layout/template real.
- Primitives, patterns, layouts y screen-templates en carpetas propias.
- Cada unidad visual con archivos reales `.html + .css + .ts` e `index.ts` cuando corresponda.
- Workbench para carga, matching, preview ORIGINAL/RESULT/OVERLAY, zoom/pan/fit, warnings y preflight.
- Accesibilidad por teclado, focus visible, semántica, reduced-motion y responsive.

### Catálogo mínimo obligatorio antes de cerrar W4

#### Foundation

Color:

- paletas tonales accent-primary, accent-secondary, accent-tertiary, neutral, neutral-variant y error.

Typography:

- familias brand/plain;
- weights regular/medium/bold;
- tracking base;
- tamaños/line-heights base necesarios.

Shape:

- none, extra-small, small, medium, large, extra-large, full;
- esquinas lógicas derivadas cuando corresponda.

State:

- hover `0.08`;
- focus `0.12`;
- pressed `0.12`;
- dragged `0.16`;
- disabled-content `0.38`;
- disabled-container `0.12`.

Motion:

- duraciones 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000 ms;
- curvas standard, emphasized, decelerate, accelerate y linear cuando corresponda.

Elevation/layout/sizing:

- niveles 0..5;
- escala espacial;
- icon sizes, control heights, touch target mínimo;
- border/stroke widths y opacity reusable cuando corresponda.

#### Semantic

Color light/dark con idéntico árbol de roles:

- primary/on-primary/container/on-container;
- secondary equivalente;
- tertiary equivalente;
- error equivalente;
- background/on-background;
- surface/on-surface;
- surface-variant/on-surface-variant;
- surface-dim/surface-bright;
- surface-container-lowest/low/base/high/highest;
- outline/outline-variant;
- inverse-surface/inverse-on-surface/inverse-primary;
- shadow, scrim, surface-tint;
- fixed/fixed-dim/on-fixed/on-fixed-variant para las tres familias de acento.

Typography:

- 15 composites base: display/headline/title/body/label × large/medium/small;
- cada composite incluye fontFamily/fontSize/fontWeight/letterSpacing/lineHeight;
- variante emphasized 1:1 disponible; prominent sólo si existe uso real.

Motion físico:

- fast/default/slow × spatial/effects;
- escalares físicos como `number`, tiempos como `duration`;
- spatial puede overshoot cuando corresponda; effects no;
- reduced-motion obligatorio.

Layout:

- width compact `<600`, medium `>=600`, expanded `>=840`, large `>=1200`, xlarge `>=1600`;
- height compact `<480`, medium `>=480`, expanded `>=900`;
- gutters, gaps, pane spacing, target sizes, max content widths, grid/columns roles y responsive density;
- sin grilla rígida universal.

Focus/layering:

- focus-ring width, active-width, inward/outward offset, shape, color, duration;
- capas semánticas para overlays/drawers/dialogs/popovers sólo si existen.

#### Component

Cada unidad visual real debe mapear, según aplique:

- container;
- content;
- icon;
- outline;
- state-layer;
- selected;
- disabled;
- error;
- typography;
- shape;
- elevation;
- size;
- spacing;
- focus;
- motion.

No se crean catálogos de componentes no usados.

### Gate de aceptación W4

W4 no cierra hasta que se verifique simultáneamente:

- JSON válido según la forma canónica;
- todo token tiene `$value` y `$type` explícito o heredado inequívocamente;
- grupos válidos sin objetos token+children;
- tipos estándar correctos para color/dimension/fontFamily/fontWeight/duration/cubicBezier/number/strokeStyle/border/transition/shadow/gradient/typography;
- aliases `{path.to.token}` resuelven a tokens existentes;
- cero referencias circulares;
- cobertura foundation -> semantic -> component;
- catálogo foundation+semantic mínimo completo, no subset decorativo;
- component tokens exhaustivos para cada componente real;
- cero duplicación gratuita cuando existe alias válido;
- `src/tokens/tokens.css` es derivación determinista 1:1;
- ninguna custom property huérfana;
- ningún token destinado a CSS sin salida;
- component CSS consume semantic/component custom properties;
- no hay hex/rgb/hsl, spacing, radius, motion, elevation, typography, sizing o borders repetidos que deban provenir de tokens;
- excepciones únicamente documentadas cuando sean intrínsecas a un asset externo;
- no existen `.template.ts` ni `.styles.ts` como patrón arquitectónico;
- no existen `css\`...\`` ni `html\`...\`` como fuente principal;
- no existe Sass/SCSS;
- TypeScript no contiene el markup principal ni hojas CSS principales de unidades visuales;
- cada unidad real tiene `.html + .css + .ts` e `index.ts` cuando corresponda;
- `prefers-reduced-motion` está contemplado para motion/shape transitions;
- UI no reimplementa parsing, matching, pricing ni SVG.

### No puede avanzar antes de cerrar

No se puede declarar W4 terminado ni integrar la UI si falla cualquiera de los gates anteriores. En particular, no se acepta un catálogo parcial, un bridge CSS manual/divergente ni componentes con hardcodes evitables.

## Fase 4 — Integración end-to-end

### Entradas

- W2, W3 y W4 con gates propios cerrados.
- Contratos compatibles bajo `src/domain/contracts/**`.

### Outputs

- Composition root mínimo en `src/main.ts`.
- Adapters de integración en `src/app/**` y/o fronteras acordadas.
- Flujo completo: fuente local -> parsing -> matching -> pricing -> SVG/font -> preflight -> preview -> export.
- Manejo de error por archivo sin bloquear outputs válidos.
- UI integrada sin romper el contrato de tokens ni duplicar estilos.

### Gate de aceptación

- No se reimplementan módulos durante la integración.
- No se mueve `src/domain/contracts/**` ni se crea una segunda fuente de contratos.
- Los conflictos se resuelven explícitamente y conservando ownership.
- La selección manual de matching se mantiene durante el batch/sesión.
- Preview y manifest reflejan exactamente las decisiones del pipeline.
- Integridad SVG y determinismo superan fixtures mínimos.
- La integración no introduce variables CSS o hardcodes visuales fuera del contrato de tokens.

### No puede avanzar antes de cerrar

No se debe empaquetar como producto final un flujo con adapters temporales, lógica duplicada, contratos bifurcados, tokens divergentes o errores críticos sin trazabilidad.

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

## Fase 6 — QA real+sintético, tokens, multiplataforma, accesibilidad e integridad

### Entradas

- Flujo integrado y paquete portable.
- Fixtures reales y sintéticos representativos.
- Catálogo y bridge de tokens cerrados por W4.

### Outputs

- Tests de XLSX/XLS/CSV, datos faltantes/inválidos, duplicados y colisiones.
- Tests de matching exacto, partial inequívoco, fuzzy-suggestion y ambigüedad manual.
- Tests SVG de placeholders simples, split-text, price-absent/unknown, integridad y overflow.
- Tests de fonts por metadata y familias requeridas.
- Tests de export individual, ZIP, manifest JSON/CSV y fallos parciales.
- Comparaciones deterministas repetidas.
- Validación Windows/Linux y del pipeline usado por Pages.
- Auditoría de accesibilidad y responsive.
- Validación automatizada del sistema de tokens.

### Gate de aceptación W6 — tokens

W6 debe validar independientemente:

- JSON válido;
- estructura de tokens/grupos correcta;
- `$type` y forma de `$value` correctos;
- aliases existentes y resolubles;
- cero ciclos;
- cobertura foundation -> semantic -> component para todos los componentes reales;
- correspondencia determinista JSON -> CSS 1:1;
- ninguna custom property CSS huérfana;
- ningún token que deba salir a CSS sin salida;
- ausencia de hex/rgb/hsl repetidos que deban venir de tokens;
- ausencia de spacing/radius/motion/elevation/tipografía/sizing/borders repetidos que deban venir de tokens;
- excepciones sólo cuando sean intrínsecas a un asset externo y estén documentadas;
- reduced-motion verificable;
- focus ring y estados accesibles consumen los tokens previstos.

### Gate de aceptación general

- Un error de un SVG no bloquea archivos válidos.
- No hay diferencias no autorizadas en paths, imágenes, viewBox, defs, filters, gradients, patterns ni regiones no-target.
- Los mismos inputs generan el mismo contenido funcional.
- Preflight clasifica `OK/WARNING/ERROR` de manera verificable.
- No quedan fallas críticas de teclado, foco o semántica.
- W6 no detecta divergencias entre JSON, CSS y consumo de componentes.

### No puede avanzar antes de cerrar

No se inicia hardening final con fallos críticos, sin cobertura de integridad/determinismo o con deuda crítica del sistema de tokens.

## Fase 7 — Hardening, auditoría final, cleanup y deuda cero crítica

### Entradas

- Gates 0–6 cerrados.

### Outputs

- Auditoría final de ownership, arquitectura, contratos y dependencia entre módulos.
- Eliminación de adapters temporales, rutas duplicadas y deuda crítica.
- Validación final de seguridad de datos locales, determinismo, integridad SVG, tokens y distribución.
- Inventario explícito de deuda no crítica restante.

### Gate de aceptación

- Cero deuda crítica conocida.
- Cero cambios fuera de ownership no autorizados.
- Cero reglas arquitectónicas canónicas incumplidas.
- Cero contratos compartidos duplicados fuera de `src/domain/contracts/**`.
- Cero divergencias JSON -> CSS -> component CSS.
- Cero divergencias entre pipeline handoff local y Pages.
- Pendientes de producto no probados siguen documentados como no asumidos, no codificados como hechos.

### No puede avanzar antes de cerrar

Esta es la última fase. Si un gate crítico falla, se vuelve a la fase responsable; no se maquilla el resultado como cierre.

## Estado de branches al documentar

Estado observado al crear/actualizar esta documentación; no implica integración:

- `main`: `3638b33cdd54b3c8c52a5bef1edc931070ed9528`, baseline/contratos W1 en `src/domain/contracts/**`.
- `build/bootstrap-toolchain`: `295d6e9f4429fdf6850f6885b964088229c1c3f1`.
- `feat/data-pricing-matching`: `bbf6dfd5009683d8bfc44c7ffc6fb6079b26ab76`; core W2 implementado en branch propia.
- `feat/svg-font-export-engine`: `c73713739d8e6910c9e818af930e6856f98f1d69`; core W3 en branch propia, aún requiere QA ejecutable/fixtures.
- `feat/ui-workbench`: `68f5fb6d0f1d49454f9c18f9b283e921b8268e12` al momento de la inspección anterior; sigue en refinamiento estructural y su gate no está cerrado mientras persistan `.template.ts`/`.styles.ts` o incumplimientos del sistema de tokens.
- `feat/distribution-handoff`: `cd5528bb5075cd7b68bee102fba74e1eead556fe`; distribución parcial por validación npm real/red/lockfile/Windows/Linux/Pages.

Ninguna de estas branches debe describirse como integrada hasta una integración dedicada con validación de gates.
