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
- conflictos explícitamente autorizados;
- migraciones estructurales necesarias para consolidar contratos sin duplicarlos.

No debe reimplementar módulos de W2/W3/W4/W5/W6.

## 4. Dependency requests

Si un worker necesita un cambio fuera de ownership:

1. no editar el archivo ajeno;
2. documentar `DEPENDENCY REQUEST`;
3. indicar archivo/API requerida;
4. explicar por qué bloquea o mejora la tarea;
5. proponer el contrato mínimo necesario, sin imponer implementación ajena.

La integración o el worker dueño resuelve la dependencia.

## 5. Contratos y duplicación

- Consumir contratos compartidos; no recrear tipos equivalentes en cada módulo.
- La lógica de dominio vive en un único dueño.
- UI no implementa parsing, matching, pricing ni SVG.
- Export no reimplementa pricing.
- Data-source no resuelve matching ni precedencia.
- App/integración sólo coordina.
- Workers no contienen copias privadas de la lógica que ejecutan.

Mientras `main` conserve contratos baseline en `src/domain/contracts/**`, éstos deben consumirse como fuente real. La estructura objetivo `src/contracts/**` sólo puede materializarse mediante migración dedicada y sin coexistencia divergente.

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

Accesibilidad requerida: teclado, focus visible, semántica, ARIA sólo cuando aporte, reduced-motion y responsive.

## 12. Tokens

- `src/tokens/tokens.json` es la fuente canónica.
- Separar primitive y semantic tokens.
- Usar `$type`, `$value` y aliases.
- `src/styles/tokens.css` es bridge 1:1.
- Component CSS consume semantic custom properties.
- Evitar hardcodes cuando existe token semántico aplicable.
- No duplicar design tokens en TS, CSS y JSON como fuentes independientes.

## 13. Determinismo

Mismos inputs + misma configuración funcional deben producir mismo contenido funcional.

Requisitos:

- orden estable de archivos/entradas;
- serialización estable donde el formato lo permita;
- manifest con orden definido;
- ZIP con contenido funcional reproducible según las capacidades de la librería elegida;
- timestamps opcionales sólo como metadata separada;
- timestamps no participan de matching, pricing, preflight, hashes funcionales ni selección de reglas;
- no depender de orden accidental de iteración, locale del sistema o timezone para decisiones funcionales.

Si una dependencia introduce nondeterminismo, debe quedar detectado y mitigado o documentado como bloqueo.

## 14. Build, handoff y distribución

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

## 15. QA mínimo por cambio

Antes de cerrar una tarea, ejecutar lo aplicable al ownership:

- typecheck;
- tests del módulo;
- tests de integración afectados;
- fixtures reales y sintéticos relevantes;
- validación de determinismo si cambia output;
- validación de integridad si cambia SVG/export;
- validación de accesibilidad si cambia UI;
- validación Windows/Linux/Pages si cambia handoff/build.

Si un test no puede ejecutarse, reportar causa exacta. No sustituir ejecución faltante por una afirmación de éxito.

## 16. Preflight y errores

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

## 17. Commits y cierre de worker

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
