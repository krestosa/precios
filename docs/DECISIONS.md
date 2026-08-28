# DECISIONS

Este documento separa decisiones congeladas, hechos observados y puntos que no deben asumirse. Si una implementación necesita convertir un pendiente en regla, debe existir evidencia y una decisión explícita nueva; no puede codificarla de forma implícita.

## A. Decisiones congeladas

### Producto y ejecución

- La aplicación es browser local/offline-first.
- El pipeline principal procesa localmente la fuente de precios, matching, pricing, SVG, fuentes, preflight y export.
- La fuente local soportada se abstrae mediante una interfaz común para XLSX/XLS/CSV.
- No se requieren credenciales frontend para el pipeline principal.
- Una adquisición remota futura, si existe, es un adapter separado y no sustituye el pipeline local.

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

### Fuentes y layout

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
- TypeScript no es fuente del markup principal ni de la hoja CSS principal.
- Importar `.html/.css` estáticos mediante `?raw` es válido.

### Tokens

- `src/tokens/tokens.json` es la fuente canónica.
- Primitive y semantic tokens se separan.
- Se usan `$type`, `$value` y aliases.
- `src/styles/tokens.css` es bridge 1:1 a CSS custom properties.
- Component CSS consume semantic custom properties.

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

## B. Hechos observados

Estos hechos describen estado verificado al crear este documento; no los convierte en integración ni en contrato futuro si cambian las branches.

### `main`

- HEAD observado: `3638b33cdd54b3c8c52a5bef1edc931070ed9528`.
- Parent directo observado: `53bca21f75d0f2942ee4eb575919891900c46c31`.
- Merge-base entre ese parent y `main` HEAD: `53bca21f75d0f2942ee4eb575919891900c46c31`.
- Contiene baseline de arquitectura y contratos W1.
- Los contratos baseline están físicamente en `src/domain/contracts/**`.

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
- HEAD observado al momento de esta documentación: `68f5fb6d0f1d49454f9c18f9b283e921b8268e12`.
- La inspección del árbol remoto mostró todavía archivos `.template.ts` y `.styles.ts` en unidades visuales.
- Por lo tanto W4 está en refinamiento estructural y no cumple aún el gate canónico `.html/.css/.ts`.
- No se considera integrado a `main`.

### W5

- Branch observada: `feat/distribution-handoff`.
- HEAD observado: `cd5528bb5075cd7b68bee102fba74e1eead556fe`.
- El trabajo de distribución existe en branch propia.
- Sigue parcial por validación npm real/red/lockfile/Windows/Linux/Pages.
- No se considera integrado a `main`.

### Estructura de contratos actual vs objetivo

- Hecho actual: `main` usa `src/domain/contracts/**`.
- Norma objetivo de directorio: `src/contracts/**`.
- Esta branch W1 documental no tiene ownership para mover `src/**`.
- Una integración dedicada deberá decidir y ejecutar una migración atómica si se normaliza esa ubicación; hasta entonces no se crean contratos duplicados.

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

### Migración física de contratos

Pendiente operativo: normalizar `src/domain/contracts/**` a la ubicación objetivo `src/contracts/**` sólo si integración lo aprueba. Debe hacerse sin definiciones paralelas ni cambios contractuales accidentales.

### Librerías concretas

No quedan congeladas por este documento librerías concretas de workbook, ZIP, font parsing o edición XML más allá de los contratos funcionales establecidos. La elección debe justificar compatibilidad browser/offline-first, determinismo, tamaño, seguridad e integridad.
