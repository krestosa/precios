# DECISIONS

Este documento separa decisiones congeladas, hechos observados y puntos que no deben asumirse. Si una implementación necesita convertir un pendiente en regla, debe existir evidencia y una decisión explícita nueva; no puede codificarla de forma implícita.

## A. Decisiones congeladas

### Producto y ejecución

- La aplicación es browser local/offline-first.
- El pipeline principal procesa localmente la fuente de precios, matching, pricing, SVG, fuentes, preflight y export.
- La fuente local soportada se abstrae mediante una interfaz común para XLSX/XLS/CSV.
- No se requieren credenciales frontend para el pipeline principal.
- Una adquisición remota futura, si existe, es un adapter separado y no sustituye el pipeline local.

### Contratos compartidos

- `src/domain/contracts/**` es la ubicación canónica y única de contratos compartidos.
- No existe una migración prevista hacia otra ruta.
- La razón arquitectónica es preservar estabilidad de imports, mantener una sola fuente de verdad y evitar churn sin beneficio funcional.
- Ningún worker debe crear una jerarquía paralela de contratos equivalentes.

### Placeholders

- `$$$$` significa NORMAL.
- `@@@@` significa ÉMINENT.
- Son literales exactos; no se reinterpretan.

### Matching

Orden congelado:

1. canonical exact;
2. tokens exactos;
3. partial inequívoco;
4. fuzzy sólo sugerencia;
5. intervención humana ante ambigüedad.

- Fuzzy no auto-selecciona.
- Un match ambiguo requiere decisión humana.
- La selección manual se conserva durante el batch/sesión.

### Pricing

- NORMAL y ÉMINENT son dimensiones independientes.
- SALÓN y DELI son dimensiones separadas de NORMAL/ÉMINENT.
- Un blanco no hereda automáticamente otro valor.
- No existe precedencia congelada entre local, grupo u otros scopes mientras no haya evidencia contractual suficiente.
- Una relación matemática esperada entre NORMAL/ÉMINENT puede validarse, pero no reemplaza un valor explícito de fuente.

### SVG

- Sólo se modifican targets de precio seguros.
- Paths nunca se editan por heurística.
- Se soporta placeholder simple y split-text defensivo.
- `price-absent` y `unknown` se consideran estados válidos/seguros del análisis; no obligan a inventar un target.
- Debe evitarse reserialización global.
- Paths, imágenes, viewBox, defs, filters, gradients, patterns y regiones no-target deben preservarse.

### Fuentes y layout de precio

- La fuente del precio se hereda del SVG real.
- Se resuelven únicamente las familias requeridas.
- Uploads TTF/OTF/WOFF/WOFF2 se identifican por metadata interna, no por filename.
- El `$` se mantiene separado, con misma family/weight/style y `font-size = price/1.5`.
- El centrado usa métricas reales.
- No se usan offsets por cantidad de caracteres.
- Overflow se detecta y reporta; no se corrige reduciendo silenciosamente el tamaño.

### UI

- Preview incluye ORIGINAL/RESULT/OVERLAY, zoom/pan/fit y warnings.
- La UI no implementa parsing, matching, pricing ni SVG.
- Web Components nativos son la arquitectura visual preferida cuando cumplen la separación real de fuentes.
- Shadow DOM es default para reutilizables; light DOM requiere justificación.
- Slots se usan para composición genérica y datos de negocio viajan por props/modelos/eventos tipados.
- No se usa `innerHTML` con datos de usuario/negocio.
- Eventos que deban cruzar Shadow DOM usan `bubbles/composed` según corresponda.

### Arquitectura de archivos visuales

- Cada primitive/pattern/layout/screen-template tiene carpeta propia.
- Cada unidad usa archivos reales `.html + .css + .ts`, más `index.ts` cuando corresponda.
- No se adopta `.template.ts` ni `.styles.ts` como patrón arquitectónico.
- No Sass/SCSS.
- No `css\`...\`` ni `html\`...\`` como fuente principal.
- TypeScript no es fuente del markup principal ni de la hoja CSS principal.
- Importar `.html/.css` estáticos mediante `?raw` es válido.

### Sistema de design tokens

#### Fuente y capas

- `src/tokens/tokens.json` es la única fuente de verdad.
- `src/tokens/tokens.css` es bridge generado/validado 1:1 desde JSON.
- Las únicas capas canónicas son `foundation.*`, `semantic.*` y `component.*`.
- Foundation contiene valores base; semantic expresa roles mediante aliases; component expresa decisiones de componentes reales mediante aliases.
- No se duplica un valor cuando existe un alias válido.
- No se crean component tokens para componentes inexistentes.

#### Forma del JSON

- Todo token es objeto con `$value`.
- `$type` es explícito o heredado inequívocamente desde el grupo; no se infiere por valor.
- `$description` es opcional.
- Un grupo no tiene `$value`.
- Un objeto no puede ser simultáneamente token y grupo con hijos.
- Los aliases usan `{path.to.token}`.
- Toda referencia debe existir y ninguna referencia puede formar ciclos.
- Extensiones sólo se permiten si no existe tipo estándar aplicable.
- Cuando correspondan se usan `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, `typography`.
- Colores usan valor estructurado con `colorSpace`, `components` y `alpha` cuando corresponda; `hex` sólo es representación auxiliar.
- Dimensiones y duraciones usan valor numérico + unidad.
- Cubic bezier usa cuatro números.
- Typography, border, transition, shadow y gradient usan composites.

#### Catálogo mínimo

Color foundation:

- accent-primary;
- accent-secondary;
- accent-tertiary;
- neutral;
- neutral-variant;
- error.

Color semantic light/dark con el mismo árbol:

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
- fixed/fixed-dim/on-fixed/on-fixed-variant para los tres accents.

Typography foundation:

- family brand/plain;
- weights regular `400`, medium `500`, bold `700`;
- tracking base y escalas necesarias.

`Inter` permanece como familia UI offline-first/fallback salvo decisión posterior explícita.

Typography semantic:

- existen exactamente 15 composites: display/headline/title/body/label × large/medium/small;
- cada composite incluye fontFamily/fontSize/fontWeight/letterSpacing/lineHeight;
- se conservan las métricas y trackings ya definidos;
- no existen roles tipográficos semánticos adicionales;
- componentes pueden usar weights foundation 400/500/700 sin ampliar la typescale.

Shape:

- existen exactamente siete roles: none `0px`, extraSmall `4px`, small `8px`, medium `12px`, large `16px`, extraLarge `28px`, full `50%`/equivalente web;
- logical corners start-start/start-end/end-start/end-end sólo descomponen esos siete roles;
- no existe una segunda escala de shape.

Elevation/state/focus:

- elevation 0..5 como shadow composites;
- hover `0.08`, focus `0.12`, pressed `0.12`, dragged `0.16`, disabled-content `0.38`, disabled-container `0.12`;
- focus ring con width, active-width, inward/outward offset, shape, color y duration.

Motion:

- existe un único esquema normal/utilitario;
- durations: 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000 ms;
- curvas de timing: standard, accelerate, decelerate y emphasized cuando corresponda;
- emphasized es sólo una curva de easing del mismo esquema;
- transitions compuestas mediante esos valores;
- los únicos spring roles son `semantic.motion.spatial.fast|default|slow` y `semantic.motion.effects.fast|default|slow`;
- spatial.fast: damping `0.9`, stiffness `1400`;
- spatial.default: damping `0.9`, stiffness `700`;
- spatial.slow: damping `0.9`, stiffness `300`;
- effects.fast: damping `1.0`, stiffness `3800`;
- effects.default: damping `1.0`, stiffness `1600`;
- effects.slow: damping `1.0`, stiffness `800`;
- damping y stiffness usan `$type: "number"`; no existe tipo spring propio;
- spatial gobierna bounds/posición/shape;
- effects gobierna color/opacity;
- component motion sólo aliasa/compone la escala, curvas y seis springs anteriores;
- no se crean familias spring adicionales ni un catálogo paralelo de motion;
- `prefers-reduced-motion` es obligatorio: movimiento espacial se elimina/degrada y effects se reduce a la mínima transición necesaria.

Layout/sizing/layering:

- escala espacial, gutters, gaps, pane spacing, target sizes, max content widths, grid/columns roles y responsive density;
- width compact `<600`, medium `>=600`, expanded `>=840`, large `>=1200`, xlarge `>=1600`;
- height compact `<480`, medium `>=480`, expanded `>=900`;
- sin grilla rígida universal;
- icon sizes, control heights, touch target mínimo, border/stroke widths y opacity reusable cuando corresponda;
- overlays/drawers/dialogs/popovers usados deben tener layering semántico, sin `z-index` mágicos dispersos.

#### Component tokens

Cada primitive/pattern/layout/template productivo tiene `component.<name>` y cubre según aplique container, content, icon, outline, state-layer, selected, disabled, error, typography, shape, elevation, size, spacing, focus y motion.

Component typography usa los 15 roles semánticos o weights foundation 400/500/700; component shape sólo referencia/descompone los siete roles canónicos; component motion sólo usa el esquema único y seis springs. Component CSS consume custom properties semánticas/de componente y no repite valores que deberían venir del catálogo. Excepciones sólo para valores intrínsecos de assets externos, documentadas.

#### Bridge y validación

- JSON es la única fuente de verdad.
- La salida CSS es determinista y 1:1.
- No puede haber custom properties sin token fuente.
- No puede haber token destinado a CSS sin salida.
- Los nombres CSS deben ser trazables al path del token.
- W4 no cierra sin inventario exacto de 15 typography, siete shapes y un único motion scheme con seis springs, además del catálogo estándar restante y consumo correcto.
- W6 valida estructura, tipos, aliases, ciclos, bridge, cobertura, inventarios exactos y ausencia de hardcodes evitables.

### Preflight y batch

- Preflight usa `OK/WARNING/ERROR`.
- Debe cubrir fonts, placeholders, ambigüedad, datos inválidos/faltantes, overflow, duplicados, colisiones, integridad y problemas equivalentes relevantes.
- Un error por SVG no debe bloquear archivos válidos cuando el pipeline pueda aislarlo.

### Export y determinismo

- Se soporta export individual y ZIP.
- Se generan `manifest.json` y `manifest.csv`.
- La trazabilidad debe ser rica y suficiente para reconstruir decisiones.
- El output funcional es determinista para mismos inputs/configuración.
- Timestamps opcionales no participan de decisiones ni hashes funcionales.

### Distribución

- Existe un único handoff OS-agnostic, copiable fuera del repo y usable sin Git.
- Windows y Linux ejecutan los mismos npm scripts.
- `install-build` instala/valida, typecheckea, testea, compila y produce `dist`.
- `run` sólo sirve un `dist` ya construido.
- La lógica sustantiva del handoff/build/server vive en Node ESM `.mjs`.
- `.ps1/.bat/.sh` son sólo launchers finos.
- Pages no mantiene un pipeline paralelo: ensambla el mismo handoff, ejecuta exactamente su pipeline y publica exactamente su `dist`.
- El workflow deja artifacts de dist, handoff y QA/logs/metadata.
- La reproducibilidad cerrada requiere lockfile canónico real cuando el entorno con red permita generarlo/validarlo.

### Ownership e integración

- W1: arquitectura/contratos/docs.
- W2: data-source, matching, pricing, normalize, parsing.
- W3: svg-engine, font-resolver, export, workers.
- W4: components, UI, layout, styles, tokens.
- W5: handoff, scripts, workflows, build configs, package/lock.
- W6: tests, fixtures, sample-data.
- Un worker no edita fuera de ownership: emite `DEPENDENCY REQUEST`.
- Integración ocurre en branch/worker dedicado y no reimplementa módulos.
- Integración no mueve `src/domain/contracts/**` por razones estéticas.

## B. Hechos observados

Estos hechos describen estado verificado al crear esta documentación; no los convierte en integración ni en contrato futuro si cambian las branches.

### `main`

- HEAD observado: `3638b33cdd54b3c8c52a5bef1edc931070ed9528`.
- Parent directo observado: `53bca21f75d0f2942ee4eb575919891900c46c31`.
- Merge-base entre ese parent y `main` HEAD: `53bca21f75d0f2942ee4eb575919891900c46c31`.
- Contiene baseline de arquitectura y contratos W1.
- Los contratos baseline están físicamente en `src/domain/contracts/**`; esa ruta queda congelada como canónica.

### Toolchain baseline

- `build/bootstrap-toolchain` HEAD observado: `295d6e9f4429fdf6850f6885b964088229c1c3f1`.
- Su parent observado es el `main` HEAD `3638b33cdd54b3c8c52a5bef1edc931070ed9528`.

### W2

- Branch observada: `feat/data-pricing-matching`.
- HEAD observado: `bbf6dfd5009683d8bfc44c7ffc6fb6079b26ab76`.
- El core de data/matching/pricing existe en branch propia.
- No se considera integrado a `main`.

### W3

- Branch observada: `feat/svg-font-export-engine`.
- HEAD observado: `c73713739d8e6910c9e818af930e6856f98f1d69`.
- Engine/font/export existe en branch propia.
- Todavía requiere QA ejecutable/fixtures antes de cerrar su gate de roadmap.
- No se considera integrado a `main`.

### W4

- Branch observada: `feat/ui-workbench`.
- HEAD observado en la inspección previa: `68f5fb6d0f1d49454f9c18f9b283e921b8268e12`.
- La inspección del árbol remoto mostró todavía archivos `.template.ts` y `.styles.ts` en unidades visuales.
- Por lo tanto W4 está en refinamiento estructural y además debe satisfacer el gate completo de tokens antes de cerrar.
- No se considera integrado a `main`.

### W5

- Branch observada: `feat/distribution-handoff`.
- HEAD observado: `cd5528bb5075cd7b68bee102fba74e1eead556fe`.
- El trabajo de distribución existe en branch propia.
- Sigue parcial por validación npm real/red/lockfile/Windows/Linux/Pages.
- No se considera integrado a `main`.

## C. NO ASUMIR / pendientes

Los siguientes puntos siguen abiertos y no pueden transformarse en reglas productivas sin evidencia o decisión posterior.

### Precedencia de precios

Pendiente: precedencia real entre local, grupo u otros scopes. No existe fallback implícito autorizado.

### Semántica de row1 `1,03`

Pendiente: significado exacto del valor/estructura `1,03` observado en row1. No interpretarlo como coeficiente, versión, descuento, separador ni otra semántica sin evidencia.

### Columna 48 del CSV

Pendiente: propósito y mapeo exacto de la columna 48. No incorporarla a pricing/matching por intuición.

### Mapeos asimétricos de grupos NORMAL/ÉMINENT

Pendiente: semántica y correspondencia de grupos cuando NORMAL y ÉMINENT presentan estructuras/mapeos asimétricos. No normalizar automáticamente ni asumir equivalencia posicional.

### Slot bounds genérico

Pendiente: contrato genérico de bounds/área disponible para targets de precio cuando el SVG no exprese de forma inequívoca el espacio de composición. Overflow debe reportarse; no inferir bounds destructivamente.

### Detección path-only externa

Pendiente: capacidad de detectar/interpretar precio convertido a path mediante tooling externo o proceso adicional. El engine actual no debe editar paths por heurística ni convertirlos implícitamente.

### Lockfile real

Pendiente: generar/validar un lockfile npm canónico íntegro en entorno con red adecuado. No fabricar un lockfile incompleto ni declarar reproducibilidad cerrada sin esa validación.

### Validación Windows/Linux/Pages

Pendiente: ejecutar el mismo handoff/pipeline real en Windows y Linux, y comprobar que GitHub Pages ensambla el mismo paquete, ejecuta exactamente ese pipeline y publica exactamente su `dist`.

### Implementación y QA del sistema de tokens

Pendiente operativo: W4 debe materializar el catálogo estándar exacto y el bridge 1:1; W6 debe validarlos. La arquitectura ya está congelada, pero eso no equivale a implementación ni QA completados.

### Librerías concretas

No quedan congeladas por este documento librerías concretas de workbook, ZIP, font parsing o edición XML más allá de los contratos funcionales establecidos. La elección debe justificar compatibilidad browser/offline-first, determinismo, tamaño, seguridad e integridad.
