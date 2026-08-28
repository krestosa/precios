# DEVELOPMENT_RULES

## 1. Principio de trabajo

Cada cambio debe preservar arquitectura, ownership, trazabilidad y determinismo. Resolver una tarea no autoriza a modificar fronteras ajenas ni a introducir atajos incompatibles con los documentos canónicos.

## 2. Branches e historial

- Cada worker trabaja en branch dedicada desde la base exacta asignada.
- Verificar antes de escribir: HEAD de la base, parent directo cuando se solicite y merge-base esperado.
- No modificar `main` directamente.
- No force push.
- No reescribir historial.
- No rebase destructivo.
- Los commits deben ser lógicos y auditables; evitar commits masivos sin relación funcional.
- Una branch existente no se considera integrada hasta una tarea de integración dedicada.

## 3. Ownership por worker

### W1

- `AGENTS.md`
- `docs/**`
- contratos/arquitectura sólo cuando la tarea lo autorice explícitamente

### W2

- `src/features/data-source/**`
- `src/features/matching/**`
- `src/domain/pricing/**`
- `src/utils/normalize/**`
- `src/utils/parsing/**`

### W3

- `src/features/svg-engine/**`
- `src/features/font-resolver/**`
- `src/features/export/**`
- `src/workers/**`

### W4

- `src/components/**`
- `src/features/ui/**`
- `src/layout/**`
- `src/styles/**`
- `src/tokens/**`

### W5

- `handoff/**`
- `scripts/**`
- `.github/workflows/**`
- build configs
- package/lock

### W6

- `tests/**`
- `fixtures/**`
- `sample-data/**`

### Integración

Worker/branch dedicado. Puede modificar sólo:

- composition root;
- adapters de integración;
- conflictos explícitamente autorizados.

No debe reimplementar módulos de W2/W3/W4/W5/W6 ni mover contratos compartidos por motivos estéticos.

## 4. Dependency requests

Si un worker necesita un cambio fuera de ownership:

1. no editar el archivo ajeno;
2. documentar `DEPENDENCY REQUEST`;
3. indicar archivo/API requerida;
4. explicar por qué bloquea o mejora la tarea;
5. proponer el contrato mínimo necesario, sin imponer implementación ajena.

La integración o el worker dueño resuelve la dependencia.

## 5. Contratos y duplicación

- `src/domain/contracts/**` es la ubicación canónica y única de contratos compartidos.
- Se mantiene esa ruta para preservar estabilidad de imports, una sola fuente de verdad y evitar churn sin beneficio funcional.
- No existe obligación ni roadmap de migrarla a otra jerarquía.
- Consumir contratos compartidos; no recrear tipos equivalentes en cada módulo.
- La lógica de dominio vive en un único dueño.
- UI no implementa parsing, matching, pricing ni SVG.
- Export no reimplementa pricing.
- Data-source no resuelve matching ni precedencia.
- App/integración sólo coordina.
- Workers no contienen copias privadas de la lógica que ejecutan.

## 6. Reglas de precios

- `$$$$` = NORMAL, literal.
- `@@@@` = ÉMINENT, literal.
- Nunca reinterpretar placeholders.
- NORMAL/ÉMINENT y SALÓN/DELI son dimensiones separadas.
- Celda blanca/vacía no hereda automáticamente.
- No inventar precedencia entre local/grupo/u otros scopes.
- No inventar fallback.
- Si una regla no está probada o congelada, producir estado unresolved/diagnóstico en lugar de decidir silenciosamente.
- Validaciones matemáticas entre NORMAL y ÉMINENT son diagnósticos; no reemplazan un valor explícito.

## 7. Matching

Secuencia obligatoria:

1. canonical exact;
2. tokens exactos;
3. partial inequívoco;
4. fuzzy sólo sugerencia;
5. intervención humana ante ambigüedad.

La selección manual debe mantenerse durante el batch/sesión. No usar fuzzy como auto-match.

## 8. Seguridad y privacidad de datos

- El pipeline principal procesa archivos localmente en browser.
- No introducir credenciales frontend como requisito.
- No enviar fuentes de precios, SVG o fuentes tipográficas a servicios remotos por defecto.
- Un adapter remoto futuro debe estar separado del core y requerir autorización/configuración explícita.
- Fixtures y sample-data no deben incluir secretos, tokens ni credenciales.
- No registrar contenido sensible completo en logs si un diagnóstico puede representarse con identificador, ubicación o resumen.
- Outputs/manifests deben contener trazabilidad funcional necesaria, no secretos operativos.

## 9. SVG e integridad

- Modificar sólo targets de precio seguros.
- Nunca editar paths por heurística.
- Soportar placeholder simple y split-text defensivo.
- Clasificar price-absent/unknown de forma segura.
- Evitar reserialización global del SVG.
- Preservar paths, imágenes, viewBox, defs, filters, gradients, patterns y regiones no-target.
- Cualquier diferencia no-target debe estar justificada, acotada y testeada.
- Un SVG con error no bloquea archivos válidos cuando el pipeline puede aislarlo.

## 10. Fuentes y métricas

- Resolver sólo familias requeridas por los SVG cargados.
- TTF/OTF/WOFF/WOFF2 se identifican por metadata interna, no por filename.
- Heredar family/weight/style del SVG real.
- `$` separado, misma family/weight/style y `font-size = price/1.5`.
- Centrado con métricas reales.
- Prohibidos offsets por cantidad de caracteres como regla de layout.
- Overflow se detecta y reporta; no reducir silenciosamente el tamaño para ocultarlo.

## 11. Reglas de componentes/UI

Cada primitive/pattern/layout/screen-template visual debe tener:

- `<name>.html` real;
- `<name>.css` real;
- `<name>.ts` real;
- `index.ts` como barrel cuando corresponda.

Prohibido como arquitectura:

- `.template.ts`;
- `.styles.ts`;
- Sass/SCSS;
- `css\`...\`` como hoja CSS principal;
- `html\`...\`` como markup estructural principal;
- markup principal generado/construido desde TypeScript;
- hojas CSS principales construidas desde TypeScript;
- `innerHTML` con datos de usuario/negocio.

Permitido:

- importar `.html/.css` reales como `?raw` mediante Vite;
- Shadow DOM por defecto en reutilizables;
- light DOM con justificación;
- slots para composición genérica;
- props/modelos/eventos tipados para datos de negocio;
- `CustomEvent` con `bubbles/composed` cuando deba cruzar Shadow DOM.

Accesibilidad requerida: teclado, focus visible, semántica, ARIA sólo cuando aporte, `prefers-reduced-motion` y responsive.

## 12. Tokens: fuente, forma y capas

### Fuente única

- `src/tokens/tokens.json` es la única fuente de verdad.
- `src/tokens/tokens.css` es bridge generado/validado 1:1.
- Un schema/validator opcional puede vivir en `src/tokens/schema/**`, pero no duplica valores.

### Capas

- `foundation.*`: valores base.
- `semantic.*`: roles de uso, mediante aliases a foundation.
- `component.*`: decisiones de cada componente real, mediante aliases a semantic/foundation.

No copiar un valor cuando existe un alias válido. No crear component tokens para componentes inexistentes.

### Forma del JSON

- Todo token tiene `$value`.
- `$type` es explícito o heredado inequívocamente del grupo.
- Nunca inferir tipo por el valor.
- `$description` es opcional.
- Grupos no tienen `$value`.
- Ningún objeto puede ser token y grupo con hijos simultáneamente.
- Alias: `{path.to.token}`.
- Toda referencia debe resolver.
- Referencias circulares están prohibidas.
- Extensiones sólo si no existe un tipo estándar aplicable y nunca para evitar uno disponible.

Tipos a usar cuando correspondan:

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

Representaciones:

- color: valor estructurado con `colorSpace`, `components` y `alpha` cuando corresponda; `hex` sólo auxiliar.
- dimension: `{ "value": n, "unit": "px"|"rem" }`.
- duration: `{ "value": n, "unit": "ms"|"s" }`.
- cubicBezier: array de cuatro números.
- composites: usar estructura correspondiente para `border`, `transition`, `shadow`, `gradient`, `typography`.

## 13. Tokens: catálogo foundation y semantic mínimo

### Color

Foundation debe contener paletas tonales completas para:

- accent-primary;
- accent-secondary;
- accent-tertiary;
- neutral;
- neutral-variant;
- error.

Light/dark son contextos coherentes con el mismo árbol de roles semánticos. Para cada contexto:

- primary/on-primary/primary-container/on-primary-container;
- secondary/on-secondary/secondary-container/on-secondary-container;
- tertiary/on-tertiary/tertiary-container/on-tertiary-container;
- error/on-error/error-container/on-error-container;
- background/on-background;
- surface/on-surface;
- surface-variant/on-surface-variant;
- surface-dim/surface-bright;
- surface-container-lowest/low/base/high/highest;
- outline/outline-variant;
- inverse-surface/inverse-on-surface/inverse-primary;
- shadow;
- scrim;
- surface-tint;
- para primary/secondary/tertiary: fixed/fixed-dim/on-fixed/on-fixed-variant.

### Typography

Foundation:

- family brand/plain;
- weight regular/medium/bold;
- tracking base;
- tamaños y line-heights base necesarios.

`Inter` permanece como familia UI offline-first/fallback salvo decisión posterior explícita.

Semantic contiene 15 composites base:

- display large/medium/small;
- headline large/medium/small;
- title large/medium/small;
- body large/medium/small;
- label large/medium/small.

Cada composite incluye `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`. Cada rol puede tener variante `emphasized` 1:1 en métricas y peso tokenizado; `prominent` sólo cuando exista necesidad real. Component CSS no hardcodea tipografía cubierta por roles.

### Shape

- none;
- extra-small;
- small;
- medium;
- large;
- extra-large;
- full.

Esquinas lógicas derivadas: start-start, start-end, end-start, end-end. Variantes parciales sólo para componentes reales que las necesiten. Geometrías complejas no escalares se mantienen fuera del token JSON o en metadata/extensión válida sólo cuando no exista tipo estándar.

### Elevation

- niveles 0..5 como composites `shadow`;
- shadow color semántico;
- componentes aliasan niveles, no repiten `box-shadow`.

### State/focus

- hover `0.08`;
- focus `0.12`;
- pressed `0.12`;
- dragged `0.16`;
- disabled-content `0.38`;
- disabled-container `0.12`.

Focus ring: width, active-width, inward offset, outward offset, shape, color y duration.

### Motion

Existe un único esquema normal/utilitario.

Duraciones foundation: 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000 ms.

Curvas foundation: standard, accelerate, decelerate y emphasized cuando corresponda como curvas de timing.

Las transiciones de componentes son composites `transition` que aliasan esos valores.

Los únicos roles spring semánticos son:

- `semantic.motion.spatial.fast`: damping `0.9`, stiffness `1400`;
- `semantic.motion.spatial.default`: damping `0.9`, stiffness `700`;
- `semantic.motion.spatial.slow`: damping `0.9`, stiffness `300`;
- `semantic.motion.effects.fast`: damping `1.0`, stiffness `3800`;
- `semantic.motion.effects.default`: damping `1.0`, stiffness `1600`;
- `semantic.motion.effects.slow`: damping `1.0`, stiffness `800`.

`damping` y `stiffness` usan `$type: "number"`; no crear un `$type` especial para spring.

Uso obligatorio:

- spatial: bounds, posición y shape;
- effects: color y opacity;
- component motion sólo aliasa/compone las duraciones, curvas y springs anteriores;
- no crear familias spring adicionales ni otro catálogo de motion.

`prefers-reduced-motion` es gate obligatorio: bounds/posición/shape se eliminan o degradan a cambio no espacial mínimo; color/opacity se reduce a la mínima transición necesaria.

### Spacing/layout

Debe haber:

- escala espacial;
- gutters;
- gaps;
- pane spacing;
- target sizes;
- max content widths;
- roles de columns/grid;
- responsive density.

Breakpoints width:

- compact `<600px`;
- medium `>=600px`;
- expanded `>=840px`;
- large `>=1200px`;
- xlarge `>=1600px`.

Breakpoints height:

- compact `<480px`;
- medium `>=480px`;
- expanded `>=900px`.

No usar una grilla rígida universal. Separar viewport, spacing foundation y roles layout semánticos.

### Sizing/border/opacity/layering

Tokenizar cuando se repitan o sean parte del sistema:

- icon sizes;
- control heights;
- touch target mínimo;
- border/stroke widths;
- stroke styles y borders compuestos;
- opacity no cubierta por state;
- capas de overlays/drawers/dialogs/popovers realmente usados.

No dispersar `z-index` mágicos. Excepciones intrínsecas a assets externos deben documentarse y no convertirse en patrón.

## 14. Component tokens

Cada primitive, pattern, layout y template productivo tiene `component.<name>` con cobertura según aplique de:

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

Los component tokens aliasan semantic/foundation y no duplican valores gratuitamente.

Component CSS no debe contener valores repetidos que deberían venir de tokens. En particular, auditar:

- hex/rgb/hsl;
- spacing repetido;
- radius repetido;
- motion repetido;
- elevation/shadows repetidos;
- tipografía repetida;
- tamaños de icon/control/target repetidos;
- borders/strokes repetidos.

## 15. Bridge JSON -> CSS

- La generación es determinista 1:1.
- JSON sigue siendo fuente única.
- Toda custom property tiene token fuente.
- No hay custom properties huérfanas.
- Todo token destinado a CSS produce salida.
- Component CSS sólo consume custom properties semánticas o de componente, salvo excepción técnica documentada.
- La correspondencia path token -> nombre CSS debe ser estable y testeable.

## 16. Determinismo

Mismos inputs + misma configuración funcional deben producir mismo contenido funcional.

Requisitos:

- orden estable de archivos/entradas;
- serialización estable donde el formato lo permita;
- manifest con orden definido;
- ZIP con contenido funcional reproducible según las capacidades de la librería elegida;
- generación de tokens CSS estable;
- timestamps opcionales sólo como metadata separada;
- timestamps no participan de matching, pricing, preflight, hashes funcionales ni selección de reglas;
- no depender de orden accidental de iteración, locale del sistema o timezone para decisiones funcionales.

Si una dependencia introduce nondeterminismo, debe quedar detectado y mitigado o documentado como bloqueo.

## 17. Build, handoff y distribución

Existe un único pipeline portable:

- el handoff es OS-agnostic y copiable fuera del repo;
- funciona sin Git;
- Windows y Linux ejecutan los mismos npm scripts;
- `install-build` instala/valida dependencias, typecheck, tests y build, y produce `dist`;
- `run` sólo sirve `dist` ya construido;
- lógica sustantiva en Node ESM `.mjs`;
- `.ps1/.bat/.sh` sólo launchers finos;
- Pages ensambla el mismo handoff, ejecuta exactamente ese pipeline y publica exactamente ese `dist`;
- el workflow conserva artifacts de dist, handoff y QA/logs/metadata;
- lockfile canónico obligatorio para declarar reproducibilidad cerrada cuando exista entorno con red apto para generarlo/validarlo.

No crear un pipeline alternativo para CI/Pages.

## 18. QA mínimo por cambio

Antes de cerrar una tarea, ejecutar lo aplicable al ownership:

- typecheck;
- tests del módulo;
- tests de integración afectados;
- fixtures reales y sintéticos relevantes;
- validación de determinismo si cambia output;
- validación de integridad si cambia SVG/export;
- validación de accesibilidad si cambia UI;
- validación de tokens si cambia JSON/CSS/UI;
- validación Windows/Linux/Pages si cambia handoff/build.

Si un test no puede ejecutarse, reportar causa exacta. No sustituir ejecución faltante por una afirmación de éxito.

## 19. QA específico de tokens

W4 debe poder demostrar antes de cerrar:

- JSON estructuralmente válido;
- tipos válidos y no inferidos por valor;
- aliases existentes y resolubles;
- cero ciclos;
- cobertura foundation -> semantic -> component;
- catálogo foundation+semantic mínimo completo;
- component tokens exhaustivos para cada componente real;
- bridge CSS 1:1;
- cero custom properties huérfanas;
- cero tokens destinados a CSS sin salida;
- cero `.styles.ts`/`.template.ts`;
- archivos reales `.html/.css/.ts` por unidad;
- motion limitado al esquema único: durations 50..1000 ms, curvas standard/accelerate/decelerate/emphasized y los seis springs canónicos con parámetros exactos;
- `prefers-reduced-motion` implementable desde tokens/estilos;
- cero hardcodes visuales evitables en component CSS.

W6 debe validar de forma independiente:

- schema/estructura;
- `$type` y forma de `$value`;
- referencias/aliases y ciclos;
- correspondencia JSON -> CSS;
- ausencia de variables CSS huérfanas;
- ausencia de tokens CSS-exportables sin salida;
- cobertura de componentes reales;
- ausencia de hex/rgb/hsl y spacing/radius/motion/elevation repetidos que deban provenir de tokens;
- que sólo existan `semantic.motion.spatial.fast|default|slow` con damping `0.9` y stiffness `1400/700/300`, y `semantic.motion.effects.fast|default|slow` con damping `1.0` y stiffness `3800/1600/800`;
- que spatial se use para bounds/posición/shape y effects para color/opacity;
- `prefers-reduced-motion` efectivo;
- excepciones únicamente cuando sean intrínsecas a un asset externo y estén documentadas.

## 20. Preflight y errores

Preflight debe representar `OK/WARNING/ERROR` y contexto suficiente para diagnóstico. Debe contemplar, cuando corresponda:

- fonts;
- placeholders;
- ambigüedad;
- datos inválidos/faltantes;
- overflow;
- duplicados;
- colisiones;
- integridad;
- export/manifest.

Los errores deben aislarse por SVG cuando sea posible.

## 21. Commits y cierre de worker

Cada worker debe reportar al final:

- WORKER;
- BRANCH;
- OBJETIVO ASIGNADO;
- ESTADO;
- RESUMEN;
- ARCHIVOS MODIFICADOS/CREADOS/ELIMINADOS;
- COMMITS;
- TESTS EJECUTADOS;
- VALIDACIONES MANUALES;
- CRITERIOS DE ACEPTACIÓN;
- PROBLEMAS ENCONTRADOS;
- DEPENDENCY REQUESTS;
- RIESGOS;
- DEUDA/PENDIENTES;
- HEAD FINAL;
- CAMBIOS FUERA DE OWNERSHIP.

El cierre debe basarse en el estado remoto real de la branch y en un diff final contra la base asignada.
