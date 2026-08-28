# ARCHITECTURE

## 1. Producto y frontera del sistema

`precios` es una aplicación browser local/offline-first. Su función es cargar una fuente local de precios y múltiples SVG, detectar el local/archivo correspondiente, relacionar cada SVG con datos de precio, aplicar NORMAL y ÉMINENT de forma explícita, ejecutar preflight, mostrar preview y exportar SVG actualizados con trazabilidad.

El pipeline productivo principal debe ejecutarse localmente en el navegador. No depende de credenciales frontend ni de un backend obligatorio. Una adquisición remota futura puede existir como adapter separado, pero no forma parte del núcleo requerido ni puede reemplazar el pipeline local.

## 2. Arquitectura de lenguajes

La separación por lenguaje es contractual:

- HTML real (`.html`): estructura/template de cada primitive, pattern, layout y screen-template.
- CSS nativo real (`.css`): estilos de esa unidad. No Sass ni SCSS.
- TypeScript (`.ts`): estado, comportamiento, tipos, adapters, eventos y coordinación. No contiene la estructura HTML principal ni hojas CSS principales del componente.
- JSON (`src/tokens/tokens.json`): fuente canónica de design tokens.
- CSS custom properties (`src/tokens/tokens.css`): bridge generado/validado 1:1 desde los tokens JSON.
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

Cada primitive/pattern/layout/template vive en carpeta propia con `<name>.html`, `<name>.css`, `<name>.ts` e `index.ts` cuando corresponda. No son válidos `.template.ts`, `.styles.ts`, `css\`...\`` ni `html\`...\`` como fuente principal.

## 4. Contratos compartidos

`src/domain/contracts/**` es la ubicación canónica y única de contratos compartidos.

La decisión favorece:

- estabilidad de imports existentes;
- una sola fuente de verdad;
- evitar churn estructural sin beneficio funcional.

No existe destino alternativo planificado para estos contratos. Los módulos W2/W3/W4/W6 deben consumirlos desde esta ruta y no crear definiciones paralelas.

## 5. Flujo de datos canónico

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

## 6. Fuente de precios

### Interfaz común

El core acepta fuentes locales XLSX/XLS/CSV detrás de una interfaz común. El adapter de formato no decide matching ni precedencia.

Una fuente remota futura, si existe, es otro adapter. Debe devolver la misma forma de snapshot/provenance y no introduce credenciales en frontend como requisito del pipeline.

### Ausencia y dimensiones

- Una celda blanca/vacía representa ausencia/desconocido según el parser; no hereda automáticamente otro valor.
- NORMAL y ÉMINENT son dimensiones separadas.
- SALÓN y DELI son dimensiones separadas de NORMAL/ÉMINENT.
- No se fija precedencia entre local, grupo u otros scopes hasta que datos/contrato la prueben.
- No se inventan fallback ni valores derivados como reemplazo silencioso de un valor explícito.

## 7. Matching

Orden contractual:

1. canonical exact;
2. tokens exactos;
3. partial inequívoco;
4. fuzzy sólo sugerencia;
5. selección manual cuando no exista resolución segura.

Ambigüedad siempre requiere intervención humana. La selección manual debe mantenerse durante el batch/sesión para evitar decisiones repetidas e inconsistentes.

Matching no resuelve precios ni modifica SVG.

## 8. Pricing

`src/domain/pricing/**` consume registros ya parseados/matcheados. Debe producir una resolución explicable, con provenance y regla aplicada cuando exista.

No puede asumir precedencia que no esté congelada en `docs/DECISIONS.md`. Tampoco puede tratar un blanco como herencia automática.

NORMAL y ÉMINENT pueden estar presentes, ausentes o desconocidos de forma independiente. Cualquier validación matemática entre ambos es diagnóstico separado; no reemplaza el valor explícito de la fuente.

## 9. SVG engine e integridad

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

No debe editar paths por heurística. Un caso path-only requiere detección/inspección externa o una capacidad futura explícitamente autorizada; no se convierte en texto ni se adivina.

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

## 10. Tipografías y composición del precio

La fuente del precio se hereda del SVG real. El resolver carga únicamente familias requeridas.

Uploads permitidos: TTF, OTF, WOFF, WOFF2. La identidad se resuelve por metadata interna de fuente; el filename sólo sirve como trazabilidad.

Para el símbolo `$`:

- se mantiene separado del número;
- conserva la misma `family`, `weight` y `style` del precio objetivo;
- usa `font-size = price/1.5`.

El centrado se calcula con métricas reales. No se permiten offsets basados en cantidad de caracteres. Overflow se detecta y reporta; no se soluciona reduciendo silenciosamente el texto.

## 11. Design tokens: contrato canónico

### 11.1 Fuente de verdad y capas

`src/tokens/tokens.json` es la única fuente de verdad. El árbol usa exclusivamente tres capas propias:

1. `foundation.*`: valores base concretos y escalas de referencia.
2. `semantic.*`: decisiones de uso expresadas preferentemente como aliases a `foundation.*`.
3. `component.*`: decisiones por componente real expresadas como aliases a `semantic.*` o, sólo cuando sea correcto, a `foundation.*`.

No se copian valores cuando existe un alias válido. No se crean catálogos de componentes inexistentes para aumentar cantidad de tokens.

### 11.2 Forma de los tokens

Reglas estructurales obligatorias:

- todo token es un objeto con `$value`;
- `$type` debe ser explícito o heredado inequívocamente desde un grupo;
- nunca se infiere el tipo a partir del valor;
- `$description` es opcional;
- los grupos no contienen `$value`;
- un objeto no puede ser simultáneamente token y grupo con hijos;
- los aliases usan la sintaxis `{path.to.token}`;
- toda referencia debe resolver a un token existente;
- no se permiten referencias circulares;
- extensiones sólo pueden usarse si no existe un tipo estándar adecuado y nunca para evitar un tipo estándar disponible.

Tipos normativos disponibles cuando correspondan:

- `color`;
- `dimension`;
- `fontFamily`;
- `fontWeight`;
- `duration`;
- `cubicBezier`;
- `number`;
- `strokeStyle`;
- `border`;
- `transition`;
- `shadow`;
- `gradient`;
- `typography`.

Representaciones mínimas:

- `color`: `$value` estructurado con `colorSpace`, `components` y `alpha` cuando corresponda; `hex` sólo puede conservarse como representación auxiliar, nunca como sustituto del valor estructurado.
- `dimension`: `{ "value": n, "unit": "px"|"rem" }`.
- `duration`: `{ "value": n, "unit": "ms"|"s" }`.
- `cubicBezier`: array de cuatro números.
- `fontFamily`, `fontWeight` y `number`: tipos nativos, no strings/objetos ad hoc para ocultar semántica.
- `typography`, `shadow`, `transition`, `border` y `gradient`: composites con los campos normativos aplicables.

### 11.3 Bridge CSS

`src/tokens/tokens.css` es una traducción generada/validada 1:1 desde JSON:

- JSON sigue siendo la única fuente de verdad;
- cada token que deba exponerse a CSS tiene una custom property determinista correspondiente;
- ninguna custom property puede existir sin token fuente;
- ningún token destinado a CSS puede quedar sin salida;
- el generador/validator no redefine valores;
- component CSS consume custom properties `semantic.*` y `component.*`; no consume valores visuales repetidos hardcodeados ni usa `foundation.*` directamente salvo excepción técnica documentada.

### 11.4 Color foundation

El catálogo foundation debe ser completo, no decorativo. Como mínimo incluye paletas tonales para:

- `accent-primary`;
- `accent-secondary`;
- `accent-tertiary`;
- `neutral`;
- `neutral-variant`;
- `error`.

Los contextos visuales `light` y `dark` deben construirse desde las mismas familias y mantener roles semánticos equivalentes.

### 11.5 Color semantic

Los contextos `semantic.color.light.*` y `semantic.color.dark.*` deben exponer el mismo árbol de roles:

- `primary`, `on-primary`, `primary-container`, `on-primary-container`;
- `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`;
- `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container`;
- `error`, `on-error`, `error-container`, `on-error-container`;
- `background`, `on-background`;
- `surface`, `on-surface`;
- `surface-variant`, `on-surface-variant`;
- `surface-dim`, `surface-bright`;
- `surface-container-lowest`, `surface-container-low`, `surface-container-base`, `surface-container-high`, `surface-container-highest`;
- `outline`, `outline-variant`;
- `inverse-surface`, `inverse-on-surface`, `inverse-primary`;
- `shadow`;
- `scrim`;
- `surface-tint`.

Para cada una de las tres familias de acento deben existir roles fixed coherentes:

- `*-fixed`;
- `*-fixed-dim`;
- `on-*-fixed`;
- `on-*-fixed-variant`.

Los pares contenido/sobre-color y container/on-container deben mantener contraste y función coherentes; no se codifican colores de contenido de manera independiente en componentes.

### 11.6 Typography foundation

Foundation tipográfica incluye como mínimo:

- `foundation.type.family.brand`;
- `foundation.type.family.plain`;
- weights `regular`, `medium`, `bold`;
- tracking base reutilizable;
- escalas de tamaño/line-height necesarias para construir roles semánticos sin repetir valores.

`Inter` se mantiene como familia UI offline-first/fallback mientras no exista una decisión posterior explícita que la reemplace.

### 11.7 Typography semantic

Debe existir un catálogo mínimo de 15 roles base:

- `display.large|medium|small`;
- `headline.large|medium|small`;
- `title.large|medium|small`;
- `body.large|medium|small`;
- `label.large|medium|small`.

Cada rol es un composite `typography` completo con:

- `fontFamily`;
- `fontSize`;
- `fontWeight`;
- `letterSpacing`;
- `lineHeight`.

Cada rol base debe poder tener variante `emphasized` 1:1 en tamaño, line-height y tracking, variando peso mediante token/alias. `prominent` sólo se incorpora donde exista uso real probado. Los componentes no hardcodean tipografía cuando existe un rol semántico o de componente.

### 11.8 Shape

Foundation/semantic shape debe cubrir:

- `none`;
- `extra-small`;
- `small`;
- `medium`;
- `large`;
- `extra-large`;
- `full`.

Las esquinas lógicas se expresan de forma derivada para:

- `start-start`;
- `start-end`;
- `end-start`;
- `end-end`.

Variantes parciales sólo se crean si un componente real las requiere. Geometrías complejas no escalares no se fuerzan a un tipo inexistente: viven como assets fuera del JSON o como metadata/extensión válida si realmente no existe tipo estándar aplicable.

Cuando una interacción use morphing/shape transition, la forma origen/destino y su motion deben estar tokenizados; reduced-motion debe degradar o eliminar la transformación espacial.

### 11.9 State y focus

Roles de estado mínimos:

- hover: `0.08`;
- focus: `0.12`;
- pressed: `0.12`;
- dragged: `0.16`;
- disabled-content: `0.38`;
- disabled-container: `0.12`.

Focus ring accesible requiere tokens propios para:

- width;
- active-width;
- inward offset;
- outward offset;
- shape;
- color;
- duration.

La UI no dispersa opacidades o valores de focus equivalentes por componente si corresponden a estos roles.

### 11.10 Motion clásico

Foundation de duración incluye al menos:

- 50, 100, 150, 200 ms;
- 250, 300, 350, 400 ms;
- 450, 500, 550, 600 ms;
- 700, 800, 900, 1000 ms.

Foundation de curvas incluye:

- `standard`;
- `emphasized`;
- `decelerate`;
- `accelerate`;
- `linear` cuando se necesite una transición lineal explícita.

Las transiciones de componentes se expresan como composites `transition` que aliasan duración y curva, no como duraciones/curvas repetidas en CSS.

### 11.11 Motion físico

Existen seis familias semánticas:

- `fast.spatial`;
- `default.spatial`;
- `slow.spatial`;
- `fast.effects`;
- `default.effects`;
- `slow.effects`.

Parámetros físicos como `stiffness`, `dampingRatio` u otros escalares se modelan con `$type: "number"`; tiempos auxiliares usan `duration`. No se inventa un `$type` especial para spring.

Reglas:

- spatial puede permitir overshoot cuando el componente lo requiera;
- effects no debe producir overshoot visual;
- cada componente que use motion físico referencia la familia semántica correspondiente;
- `prefers-reduced-motion` es gate obligatorio: transformaciones, desplazamientos y morphing se eliminan o degradan a un cambio no espacial mínimo.

### 11.12 Elevation

Debe existir una escala de elevation 0..5 mediante tokens `shadow` compuestos y un rol semántico de shadow color.

Los componentes aliasan niveles de elevation; no repiten `box-shadow` suelto si corresponde a un nivel compartido.

### 11.13 Spacing, layout y grid

Separar tres conceptos:

- viewport/breakpoints;
- spacing foundation;
- roles layout semánticos.

Breakpoints mínimos de ancho:

- compact: `<600px`;
- medium: `>=600px`;
- expanded: `>=840px`;
- large: `>=1200px`;
- xlarge: `>=1600px`.

Breakpoints mínimos de alto:

- compact: `<480px`;
- medium: `>=480px`;
- expanded: `>=900px`.

El catálogo debe cubrir:

- escala espacial;
- gutters;
- gaps;
- pane spacing;
- target sizes;
- max content widths;
- roles de columnas/grid;
- densidad responsive.

La grilla web es flexible/adaptativa. No existe una cantidad universal rígida de columnas para toda pantalla.

### 11.14 Sizing, borders y opacity

Debe existir cobertura reusable para:

- icon sizes;
- control heights;
- touch target mínimo;
- border/stroke widths;
- stroke styles y borders compuestos cuando se repitan;
- opacity reusable no cubierta ya por state.

Los valores intrínsecos únicos de un asset externo pueden quedar fuera de tokens sólo si la excepción está documentada y no se propaga como patrón visual repetido.

### 11.15 Z/layering

Si la UI usa overlays, drawers, dialogs o popovers, debe existir una escala semántica de layering. Scrim y capas interactivas se resuelven mediante roles, no mediante `z-index` mágicos dispersos.

No se crean roles de layering para componentes inexistentes.

### 11.16 Component tokens

Cada primitive, pattern, layout o template productivo debe tener grupo `component.<name>` que cubra, según aplique:

- container;
- content;
- icon;
- outline;
- state-layer;
- selected;
- disabled;
- error;
- typography/type;
- shape;
- elevation;
- size;
- spacing/space;
- focus;
- motion.

Los valores se expresan preferentemente como aliases a semantic/foundation. La cobertura es exhaustiva para cada componente real, pero no se inventan familias de componentes no usados.

## 12. Preflight

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

## 13. Preview/UI

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

## 14. Export y trazabilidad

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

## 15. App y composition root

`src/app/**` coordina adapters de integración y estado de aplicación sin duplicar lógica de dominio.

`src/main.ts` es un composition root mínimo: registra/instancia módulos y conecta fronteras. No debe convertirse en un módulo de negocio.

La integración dedicada puede adaptar contratos entre branches y resolver conflictos explícitos. No debe reimplementar cores ni mover `src/domain/contracts/**` por razones estructurales.

## 16. Workers

`src/workers/**` se reserva para trabajo pesado cuando exista beneficio medible de aislamiento/responsividad. Un Web Worker no es requisito por sí mismo ni justifica duplicar lógica.

## 17. Distribución y build

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
