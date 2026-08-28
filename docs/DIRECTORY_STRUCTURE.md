# DIRECTORY_STRUCTURE

## Regla general

La estructura siguiente es la norma objetivo. Una unidad nueva debe ubicarse por responsabilidad, no por conveniencia. No se crean carpetas paralelas que dupliquen dominio, contratos o UI.

```text
src/
├─ app/
├─ components/
│  ├─ primitives/
│  │  └─ <name>/
│  │     ├─ <name>.html
│  │     ├─ <name>.css
│  │     ├─ <name>.ts
│  │     └─ index.ts
│  └─ patterns/
│     └─ <name>/
│        ├─ <name>.html
│        ├─ <name>.css
│        ├─ <name>.ts
│        └─ index.ts
├─ layout/
│  └─ <name>/
│     ├─ <name>.html
│     ├─ <name>.css
│     ├─ <name>.ts
│     └─ index.ts
├─ features/
│  ├─ ui/
│  │  ├─ templates/
│  │  │  └─ <name>/
│  │  │     ├─ <name>.html
│  │  │     ├─ <name>.css
│  │  │     ├─ <name>.ts
│  │  │     └─ index.ts
│  │  └─ ... view-models/adapters UI
│  ├─ data-source/
│  ├─ matching/
│  ├─ svg-engine/
│  ├─ font-resolver/
│  └─ export/
├─ domain/
│  └─ pricing/
├─ contracts/
├─ tokens/
│  └─ tokens.json
├─ styles/
│  ├─ tokens.css
│  └─ ... global/reset sólo si corresponde
├─ utils/
│  ├─ normalize/
│  └─ parsing/
├─ workers/
└─ main.ts

tests/
fixtures/
sample-data/
scripts/
handoff/
.github/
└─ workflows/
docs/
AGENTS.md
```

## `src/app/**`

Responsabilidad: coordinación de aplicación, adapters de integración y wiring entre módulos.

Permitido:

- composición de casos de uso;
- estado de aplicación no perteneciente a un dominio específico;
- adapters que traduzcan APIs públicas entre módulos;
- orquestación de batch.

No permitido:

- duplicar parsing;
- duplicar matching;
- resolver pricing nuevamente;
- manipular SVG por fuera del engine;
- esconder reglas de dominio en controladores UI.

## `src/components/primitives/**`

Unidad visual mínima reutilizable. Cada primitive tiene carpeta propia y los archivos reales:

- `<name>.html`;
- `<name>.css`;
- `<name>.ts`;
- `index.ts` cuando corresponda.

No se permiten `.template.ts` ni `.styles.ts` como sustitutos.

## `src/components/patterns/**`

Composición reusable de primitives y/o otras unidades visuales. Mismas reglas de archivos que primitives.

Un pattern no representa una pantalla completa ni debe incorporar lógica de parsing/pricing/matching/SVG.

## `src/layout/**`

Estructura espacial reusable: shells, splits, stacks, panes u otras composiciones equivalentes necesarias por producto. Cada layout mantiene `.html + .css + .ts` separados.

No contiene reglas de negocio.

## `src/features/ui/templates/**`

Screen-templates o estructuras de flujo/pantalla. Cada template visual tiene carpeta y archivos reales `.html + .css + .ts`, más `index.ts` cuando corresponda.

El template compone patterns/layouts y conecta view-models; no implementa dominio.

## `src/features/ui/**`

View-models, adapters de UI, tipos de presentación y coordinación visual.

Puede convertir resultados de dominio a modelos de vista. No puede implementar parsing, pricing, matching ni SVG.

## `src/features/data-source/**`

Adapters para XLSX/XLS/CSV locales detrás de la interfaz común de fuente de precios. Una adquisición remota futura, si se aprueba, vive como adapter separado y no altera el pipeline local.

No decide matching ni precedencia de pricing.

## `src/features/matching/**`

Implementa exclusivamente la escalera de matching, scoring/sugerencias permitidas y conservación de selección manual de sesión/batch.

No resuelve precios ni edita SVG.

## `src/domain/pricing/**`

Lógica de dominio para resolver NORMAL/ÉMINENT usando contratos y reglas explícitas demostradas. No conoce DOM/UI ni formato de workbook.

## `src/features/svg-engine/**`

Clasificación de SVG, localización de targets seguros, modificación quirúrgica, medición/posicionamiento coordinado con font resolver e integridad.

No realiza matching de negocio ni decide precedencia de precios.

## `src/features/font-resolver/**`

Carga y resolución de metadata tipográfica requerida; soporte TTF/OTF/WOFF/WOFF2; métricas para layout de precio.

Filename no es identidad de fuente.

## `src/features/export/**`

Export individual, ZIP, manifests, hashes/identificadores estables y validaciones de salida relacionadas.

No redefine reglas de pricing ni modifica targets SVG fuera de la API del engine.

## `src/contracts/**`

Ubicación objetivo de contratos compartidos entre workers/módulos. Debe contener tipos/contratos, no lógica de negocio.

Estado actual observado: el baseline en `main` conserva contratos W1 bajo `src/domain/contracts/**`. Hasta que una integración dedicada normalice la ubicación, esos contratos existentes son la fuente real y no deben duplicarse en `src/contracts/**`. La migración debe ser atómica y explícitamente autorizada.

## `src/tokens/tokens.json`

Fuente canónica de design tokens.

Reglas:

- separar primitive tokens y semantic tokens;
- usar `$type`, `$value` y aliases;
- evitar duplicación de valores y hardcodes evitables;
- component CSS consume semantic tokens mediante custom properties.

## `src/styles/tokens.css`

Bridge 1:1 de tokens JSON a CSS custom properties. No es una segunda fuente de verdad.

Otros archivos en `src/styles/**` sólo para reset/global realmente global. Estilos de una unidad visual pertenecen a su propia carpeta.

## `src/utils/normalize/**`

Normalizaciones puras y reutilizables. No debe transformarse en un contenedor genérico de lógica de negocio.

## `src/utils/parsing/**`

Parsing reusable de bajo nivel y utilidades de formato. Las decisiones de schema/fuente específicas deben vivir en adapters de `data-source` cuando corresponda.

## `src/workers/**`

Entrypoints/adapters de Web Workers necesarios por carga real. La lógica sustantiva sigue en módulos testeables y no se duplica dentro del worker.

## `src/main.ts`

Composition root mínimo. Registra/inicializa y conecta módulos. No contiene lógica de negocio ni markup/estilos principales.

## `tests/**`

Tests automatizados de unidad, integración y/o sistema según ownership W6. No se mezclan fixtures reales dentro del código productivo.

## `fixtures/**`

Fixtures versionados reales y sintéticos necesarios para QA: SVG, workbook/CSV y fuentes permitidas por el proyecto, con provenance/documentación cuando corresponda.

## `sample-data/**`

Datos de demostración o muestras de uso. No reemplazan fixtures de regresión y no deben contener secretos/credenciales.

## `scripts/**`

Tooling del repo y scripts de build/QA/ensamblado. La lógica portable sustantiva debe ser Node ESM `.mjs` cuando participe del handoff/pipeline multiplataforma.

## `handoff/**`

Paquete OS-agnostic autocontenido para copiar fuera del repo y operar sin Git. No debe depender de metadata del repositorio.

## `.github/workflows/**`

Automatización de Pages/QA cuando corresponda. No debe introducir un segundo pipeline de build: Pages usa el mismo handoff y publica el `dist` producido por éste.

## `docs/**`

Documentación canónica y decisiones. No almacenar aquí código productivo que deba ser ejecutado.

## Reglas de naming y barrels

- Carpetas de unidades visuales: kebab-case salvo contrato existente que obligue otra convención.
- El basename de `.html`, `.css` y `.ts` debe coincidir con la carpeta.
- `index.ts` expone la API pública de la unidad; no concentra implementación.
- Evitar barrels globales que creen ciclos o oculten ownership.

## Archivos/patrones prohibidos por arquitectura visual

- `*.template.ts` como fuente principal de markup.
- `*.styles.ts` como fuente principal de CSS.
- Sass/SCSS.
- `css\`...\`` o arrays/strings TypeScript que construyan hojas de estilo principales.
- `html\`...\`` o strings TypeScript como markup estructural principal.
- CSS hardcodeado en TypeScript salvo valores dinámicos puntuales que no constituyan una hoja de estilos y estén justificados.

La importación `?raw` de archivos `.html/.css` reales sí es válida porque preserva la separación de fuentes.
