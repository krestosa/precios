# ARCHITECTURE

## 1. Producto y frontera del sistema

`precios` es una aplicación browser local/offline-first. Su función es cargar una fuente local de precios y múltiples SVG, detectar el local/archivo correspondiente, relacionar cada SVG con datos de precio, aplicar NORMAL y ÉMINENT de forma explícita, ejecutar preflight, mostrar preview y exportar SVG actualizados con trazabilidad.

El pipeline productivo principal debe ejecutarse localmente en el navegador. No depende de credenciales frontend ni de un backend obligatorio. Una adquisición remota futura puede existir como adapter separado, pero no forma parte del núcleo requerido ni puede reemplazar el pipeline local.

## 2. Arquitectura de lenguajes

La separación por lenguaje es contractual:

- HTML real (`.html`): estructura/template de cada primitive, component/pattern, layout y screen-template.
- CSS nativo real (`.css`): estilos de esa unidad. No Sass ni SCSS.
- TypeScript (`.ts`): estado, comportamiento, tipos, adapters, eventos y coordinación. No contiene la estructura HTML principal ni hojas CSS principales del componente.
- JSON (`src/tokens/tokens.json`): fuente canónica de design tokens.
- CSS custom properties (`src/styles/tokens.css`): bridge 1:1 desde tokens JSON.
- Node ESM (`.mjs`): tooling portable, build, handoff y servidor local.
- SVG/XML: input/output preservado quirúrgicamente.

HTML y CSS estáticos controlados por el repo pueden importarse mediante `?raw` por Vite e instalarse en `template`/Shadow Root. Esa importación no convierte TypeScript en fuente de markup o estilos.

## 3. Arquitectura visual

Web Components nativos son la opción preferida si permiten cumplir la separación real HTML/CSS/TS.

Reglas:

- Shadow DOM por defecto para unidades reutilizables.
- Light DOM sólo con justificación concreta de composición, interoperabilidad o semántica.
- Slots para composición genérica.
- Datos de negocio por props/modelos/eventos tipados; no por interpolación insegura de HTML.
- No usar `innerHTML` con datos de usuario o negocio.
- Los recursos HTML/CSS del repositorio son estáticos/controlados.
- `CustomEvent` que deba cruzar Shadow DOM usa `bubbles` y `composed` según corresponda.
- Primitive = unidad mínima; pattern = composición reusable; layout = estructura espacial; screen-template = estructura/flujo de pantalla.

Cada primitive/pattern/layout/template vive en carpeta propia con `<name>.html`, `<name>.css`, `<name>.ts` e `index.ts` cuando corresponda. `.template.ts` y `.styles.ts` no son patrones permitidos.

## 4. Flujo de datos canónico

1. `data-source` recibe XLSX/XLS/CSV local mediante una interfaz común de price source.
2. `parsing` transforma el snapshot de fuente conservando raw, ubicación y provenance.
3. `matching` relaciona identidad de archivo/local con candidatos mediante la escalera contractual.
4. `pricing` resuelve únicamente valores demostrados por el contrato/datos disponibles.
5. `svg-engine` clasifica targets de precio seguros y prepara una modificación quirúrgica.
6. `font-resolver` resuelve sólo las familias requeridas por metadata real y provee métricas.
7. El engine posiciona precio y símbolo según métricas, detecta overflow y conserva regiones no-target.
8. `preflight` produce `OK`, `WARNING` o `ERROR` por archivo y por lote cuando corresponda.
9. `features/ui` presenta ORIGINAL/RESULT/OVERLAY, zoom/pan/fit, warnings, ambigüedades y decisiones manuales.
10. `export` produce SVG individuales o ZIP, junto con `manifest.json` y `manifest.csv`.

El error de un SVG debe quedar aislado siempre que sea posible y no bloquear archivos válidos.

## 5. Fuente de precios

### Interfaz común

El core acepta fuentes locales XLSX/XLS/CSV detrás de una interfaz común. El adapter de formato no decide matching ni precedencia.

Una fuente remota futura, si existe, es otro adapter. Debe devolver la misma forma de snapshot/provenance y no introduce credenciales en frontend como requisito del pipeline.

### Ausencia y dimensiones

- Una celda blanca/vacía representa ausencia/desconocido según el parser; no hereda automáticamente otro valor.
- NORMAL y ÉMINENT son dimensiones separadas.
- SALÓN y DELI son dimensiones separadas de NORMAL/ÉMINENT.
- No se fija precedencia entre local, grupo u otros scopes hasta que datos/contrato la prueben.
- No se inventan fallback ni valores derivados como reemplazo silencioso de un valor explícito.

## 6. Matching

Orden contractual:

1. canonical exact;
2. tokens exactos;
3. partial inequívoco;
4. fuzzy sólo sugerencia;
5. selección manual cuando no exista resolución segura.

Ambigüedad siempre requiere intervención humana. La selección manual debe mantenerse durante el batch/sesión para evitar decisiones repetidas e inconsistentes.

Matching no resuelve precios ni modifica SVG.

## 7. Pricing

`domain/pricing` consume registros ya parseados/matcheados. Debe producir una resolución explicable, con provenance y regla aplicada cuando exista.

No puede asumir precedencia que no esté congelada en `docs/DECISIONS.md`. Tampoco puede tratar un blanco como herencia automática.

NORMAL y ÉMINENT pueden estar presentes, ausentes o desconocidos de forma independiente. Cualquier validación matemática entre ambos es diagnóstico separado; no reemplaza el valor explícito de la fuente.

## 8. SVG engine e integridad

### Placeholders

Los placeholders son literales e inmutables:

- `$$$$` = NORMAL.
- `@@@@` = ÉMINENT.

Nunca se reinterpretan ni se invierten.

### Targets seguros

El engine sólo modifica targets de precio con evidencia segura. Debe soportar:

- placeholder simple;
- placeholder dividido en text/tspan de forma defensiva;
- `price-absent`;
- `unknown`;
- otros estados explícitamente modelados por contratos.

No debe editar paths por heurística. Un caso path-only requiere detección/inspección externa o una capacidad futura explícitamente autorizada; no se convierte en texto ni se “adivina”.

### Preservación

Fuera del target autorizado deben permanecer idénticos, salvo diferencias técnicas estrictamente necesarias y verificadas:

- paths;
- imágenes;
- `viewBox`;
- `defs`;
- filters;
- gradients;
- patterns;
- atributos y regiones no-target.

Se debe evitar reserialización global del documento. La estrategia preferida es editar el mínimo rango/nodo necesario y comprobar integridad del resto.

## 9. Tipografías y composición del precio

La fuente del precio se hereda del SVG real. El resolver carga únicamente familias requeridas.

Uploads permitidos: TTF, OTF, WOFF, WOFF2. La identidad se resuelve por metadata interna de fuente; el filename sólo sirve como trazabilidad.

Para el símbolo `$`:

- se mantiene separado del número;
- conserva la misma `family`, `weight` y `style` del precio objetivo;
- usa `font-size = price/1.5`.

El centrado se calcula con métricas reales. No se permiten offsets basados en cantidad de caracteres. Overflow se detecta y reporta; no se soluciona reduciendo silenciosamente el texto.

## 10. Preflight

Preflight agrega diagnósticos con severidad `OK`, `WARNING` o `ERROR` y contexto suficiente para UI/export.

Debe cubrir, como mínimo cuando corresponda:

- fuentes requeridas o no resueltas;
- placeholders ausentes, múltiples o inseguros;
- ambigüedad de matching;
- datos faltantes o inválidos;
- overflow;
- duplicados;
- colisiones;
- integridad SVG;
- inconsistencias de export/manifest.

Bloqueo se decide por archivo siempre que sea posible. El lote puede continuar con archivos válidos.

## 11. Preview/UI

La UI es una frontera de presentación. Consume view-models/adapters y resultados de dominio; no implementa parsing, pricing, matching ni SVG.

Capacidades contractuales:

- ORIGINAL;
- RESULT;
- OVERLAY;
- zoom;
- pan;
- fit;
- warnings/preflight;
- resolución manual de ambigüedades;
- estado por archivo/batch.

Accesibilidad mínima: teclado, focus visible, semántica correcta, ARIA sólo cuando aporte, reduced-motion y responsive.

## 12. Export y trazabilidad

Debe existir:

- export individual;
- export ZIP;
- `manifest.json`;
- `manifest.csv`.

La trazabilidad debe permitir reconstruir, cuando exista la información:

- archivo SVG de entrada y output;
- local/identidad detectada;
- método y estado de matching;
- selección manual si existió;
- NORMAL y ÉMINENT usados o ausentes;
- provenance de fuente;
- regla aplicada por pricing;
- fuente tipográfica resuelta;
- warnings/errors;
- hashes o identificadores estables cuando correspondan.

El contenido funcional debe ser determinista. Timestamps opcionales pueden existir sólo como metadata y no deben cambiar decisiones ni hashes funcionales.

## 13. App y composition root

`src/app/**` coordina adapters de integración y estado de aplicación sin duplicar lógica de dominio.

`src/main.ts` es un composition root mínimo: registra/instancia módulos y conecta fronteras. No debe convertirse en un módulo de negocio.

La integración dedicada puede adaptar contratos entre branches, mover contratos a su ubicación canónica acordada y resolver conflictos explícitos. No debe reimplementar cores.

## 14. Workers

`src/workers/**` se reserva para trabajo pesado cuando exista beneficio medible de aislamiento/responsividad. Un Web Worker no es requisito por sí mismo ni justifica duplicar lógica.

## 15. Distribución y build

Existe un único contrato de handoff:

- paquete OS-agnostic copiable fuera del repo y usable sin Git;
- Windows y Linux ejecutan los mismos npm scripts;
- `install-build` instala/valida, typecheckea, testea, compila y produce `dist`;
- `run` sirve un `dist` ya construido y no compila implícitamente;
- lógica sustantiva en Node ESM `.mjs`;
- `.ps1/.bat/.sh` sólo launchers finos;
- el handoff no depende de metadata/servicios del repo;
- GitHub Pages no posee pipeline paralelo: ensambla ese mismo handoff, ejecuta exactamente su pipeline y publica exactamente su `dist`;
- workflow conserva artifacts de dist, handoff y QA/logs/metadata;
- reproducibilidad requiere lockfile canónico real cuando el entorno con red permita generarlo/validarlo.

## 16. Contratos compartidos y ubicación

La estructura objetivo documentada para nuevas integraciones es `src/contracts/**`.

Hecho observado: `main` en `3638b33cdd54b3c8c52a5bef1edc931070ed9528` contiene el baseline W1 en `src/domain/contracts/**`. Esta branch documental no puede mover `src/**` por ownership. Hasta una integración dedicada, los workers deben consumir los contratos existentes en su ubicación real y no crear una segunda definición incompatible. Cualquier migración a `src/contracts/**` debe ser atómica, acordada y sin duplicación.
