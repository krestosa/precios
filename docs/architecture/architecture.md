# Arquitectura base

## Objetivo

`precios` será una aplicación frontend-only y offline-first para tomar fuentes de precios trazables, relacionarlas con piezas SVG y producir archivos exportables con preflight y manifest por archivo. El procesamiento principal ocurre en el navegador. No existe un backend obligatorio.

Esta fase define límites y contratos; no implementa toolchain, dependencias ni engines productivos.

## Principios

- TypeScript estricto como contrato entre módulos.
- Pipeline local y modular; cada etapa recibe y devuelve datos explícitos.
- Ausencia de datos no equivale a cero ni habilita herencia automática.
- Los precios NORMAL y ÉMINENT son valores explícitos independientes.
- La relación esperada de ÉMINENT 25% se valida por separado; nunca reemplaza un valor explícito de fuente.
- No se fija todavía ninguna precedencia entre local, grupo u otros scopes.
- No se codifica `GENERAL` ni otra etiqueta como fallback implícito.
- Matching fuzzy sólo puede producir sugerencias; no selecciona automáticamente.
- Un SVG puede no tener precio y debe seguir siendo un caso válido del pipeline.
- Los targets SVG se identifican por evidencia estructural explícita; no por cualquier `<text>` ni por heurísticas creativas.
- Los errores son por archivo siempre que sea posible: un archivo bloqueado no invalida necesariamente el lote.
- Timestamps son metadata opcional y no deben participar de decisiones funcionales ni romper determinismo.

## Stack objetivo

La base preferida para la siguiente fase es:

- Vite.
- TypeScript en modo estricto.
- Web Components.
- Componentes UI desacoplados y un design system local donde corresponda.
- Librería local en navegador para leer workbooks.
- Librería local en navegador para crear/leer ZIP.
- `DOMParser` + `XMLSerializer`, o equivalente estructurado, para SVG.
- Web Workers sólo para trabajo pesado que aporte aislamiento o responsividad medible.
- Sin IndexedDB obligatorio. Sólo se incorporará si aparece una necesidad explícita de persistencia local.

W5 deberá implementar toolchain, dependencias, build y packaging. Este documento no fija paquetes concretos antes de esa evaluación.

## Módulos

### `src/domain/contracts`

Fuente de verdad para entidades compartidas. No contiene lógica de negocio. W2, W3, W4 y W6 deben consumir estos contratos en lugar de redefinirlos.

### Data sources

Implementaciones futuras de `PriceSource`:

- `local-workbook`: archivo cargado por el usuario y procesado localmente.
- `google-sheets`: origen remoto opcional; no se asume disponible offline.

La salida conserva filas/celdas y ubicación de origen suficiente para trazabilidad. Las celdas vacías se preservan como ausencia/desconocido.

### Parsing / schema adapters

Transforman snapshots de fuente a registros de dominio sin resolver matching ni precedencia. Deben conservar `raw` y provenance. Las asimetrías entre encabezados NORMAL y ÉMINENT se reportan; no se corrigen automáticamente.

### Matching

Escalera permitida:

1. canonical exact;
2. exact tokens;
3. unambiguous partial;
4. fuzzy suggestion solamente;
5. selección manual como override de sesión.

La ambigüedad requiere decisión humana. El contrato no autoriza fuzzy auto-match.

### Pricing resolution

Recibe registros ya adaptados/matcheados y produce una resolución explicada. El resolver deberá declarar la regla aplicada, pero esta fase no impone precedencia entre scopes porque discovery no la demostró.

NORMAL y ÉMINENT pueden estar presentes, ausentes o desconocidos de manera independiente. La validación de 25% es un resultado separado de la resolución.

### SVG engine

Clasificaciones compartidas:

- `price-editable`;
- `price-absent`;
- `price-already-set`;
- `split-tspan`;
- `price-path-only`;
- `unknown`.

Discovery real cerró 13 SVG: 5 `price-editable` por placeholders literales y 8 `price-absent`. Los placeholders contractuales son `$$$$` para NORMAL y `@@@@` para ÉMINENT. No se asume que todo SVG tenga targets de precio.

`split-tspan` queda soportado por contrato para fixture sintético defensivo; no apareció en los assets reales. Tampoco apareció precio real convertido a paths.

El engine deberá preservar estructura, estilos y diferencias permitidas explícitas. No debe interpretar cualquier nodo de texto como precio.

### Font resolver

Resuelve familia, subfamilia, weight y style desde fuentes del sistema o archivos cargados. El nombre de archivo sirve sólo como metadata de trazabilidad; la identidad tipográfica debe provenir de metadata real de la fuente.

Los targets observados usan Acumin Pro Wide weight 600, pero el contrato no hardcodea esa familia como única posibilidad. La medición de `$ + número` deberá usar métricas reales de la fuente resuelta.

### Preflight

Produce issues `OK | WARNING | ERROR` con código, mensaje, detalles y archivo afectado. `blocking` pertenece al resultado de cada archivo. Un lote puede exportar archivos válidos aunque otros fallen.

### Preview / UI

W4 consumirá resultados y diagnósticos sin reimplementar pricing, matching ni parsing SVG. La UI debe exponer ambigüedades y selección manual cuando corresponda.

### Export / manifest

Cada archivo exportado lleva traceability suficiente para reconstruir:

- SVG fuente y filename original;
- local detectado y nombre canónico si existe;
- método/confidence de matching;
- NORMAL/ÉMINENT;
- excepción y regla aplicada;
- fuente de datos y ubicaciones de hoja/fila/columna/celda o equivalente;
- fuente tipográfica usada;
- warnings/errors;
- identificador/hash estable cuando exista.

El manifest debe poder representarse como JSON y CSV. Un timestamp opcional puede incluirse como metadata, pero no cambia el contenido funcional.

### Workers

Sólo se usarán Web Workers cuando exista carga real que justifique mover parsing, medición o empaquetado fuera del hilo principal. No son una frontera arquitectónica obligatoria.

### Packaging / handoff

W5 definirá build reproducible, dependencias, estrategia de Pages y handoff. Esta fase no crea `package.json`, lockfiles, configuración Vite/TS ni workflows.

### QA / fixtures

W6 deberá cubrir contratos y casos reales/sintéticos, incluyendo:

- vacío preservado como desconocido;
- ÉMINENT explícito distinto de la validación 25%;
- ambigüedad sin auto-selección;
- fuzzy sólo como sugerencia;
- SVG `price-absent` válido;
- placeholders `$$$$` / `@@@@`;
- fixture `split-tspan` defensivo;
- overflow tipográfico;
- fallos parciales de batch.

## Flujo de datos

1. Una fuente produce `SourceSnapshot` con metadata, celdas y diagnósticos.
2. Un adapter genera `PricingRecord` conservando raw/provenance.
3. Matching relaciona entradas con candidatos y deja ambigüedades explícitas.
4. Pricing resolution selecciona valores sólo mediante una regla declarada por implementación futura.
5. SVG/font modules clasifican targets y miden contenido.
6. Preflight decide bloqueo por archivo.
7. Preview muestra estado sin alterar reglas de dominio.
8. Export genera outputs válidos y manifest JSON/CSV, preservando errores parciales.

## Decisiones deliberadamente abiertas

Dependen de implementación o evidencia posterior y no forman parte del contrato base:

- precedencia entre local, grupo u otros scopes;
- cualquier fallback de precios;
- normalización definitiva de encabezados asimétricos;
- librerías concretas de workbook y ZIP;
- estrategia concreta de cache/persistencia;
- configuración final de GitHub Pages;
- heurísticas productivas de matching dentro de los niveles permitidos.

No debe accederse al Google Sheet real del usuario durante esta fase ni para validar estos contratos.
