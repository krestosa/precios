# DIRECTORY_STRUCTURE

## Regla general

La estructura siguiente es la norma objetivo. Una unidad nueva debe ubicarse por responsabilidad, no por conveniencia. No se crean carpetas paralelas que dupliquen dominio, contratos, tokens o UI.

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
│  ├─ contracts/
│  └─ pricing/
├─ tokens/
│  ├─ tokens.json
│  ├─ tokens.css
│  └─ schema/              # opcional: schema/validator, sin valores duplicados
├─ styles/
│  └─ ... reset/global sólo si corresponde
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

Unidad visual mínima reutilizable. Cada primitive tiene carpeta propia y archivos reales:

- `<name>.html`;
- `<name>.css`;
- `<name>.ts`;
- `index.ts` cuando corresponda.

No se permiten `.template.ts`, `.styles.ts`, `css\`...\`` ni `html\`...\`` como sustitutos del archivo real.

Cada primitive productivo debe tener cobertura de tokens bajo `component.<name>` según sus ejes visuales reales.

## `src/components/patterns/**`

Composición reusable de primitives y/o otras unidades visuales. Mismas reglas de archivos que primitives.

Un pattern no representa una pantalla completa ni debe incorporar lógica de parsing/pricing/matching/SVG. Cada pattern real debe tener cobertura `component.<name>` de sus decisiones visuales propias; no duplica tokens de primitives que sólo compone.

## `src/layout/**`

Estructura espacial reusable: shells, splits, stacks, panes u otras composiciones equivalentes necesarias por producto. Cada layout mantiene `.html + .css + .ts` separados y tokens `component.<name>` sólo para decisiones espaciales/visuales propias que deban parametrizarse.

No contiene reglas de negocio.

## `src/features/ui/templates/**`

Screen-templates o estructuras de flujo/pantalla. Cada template visual tiene carpeta y archivos reales `.html + .css + .ts`, más `index.ts` cuando corresponda.

El template compone patterns/layouts y conecta view-models; no implementa dominio. Si tiene decisiones visuales propias reutilizadas o temáticas, las expresa mediante `component.<name>`.

## `src/features/ui/**`

View-models, adapters de UI, tipos de presentación y coordinación visual.

Puede convertir resultados de dominio a modelos de vista. No puede implementar parsing, pricing, matching ni SVG.

## `src/features/data-source/**`

Adapters para XLSX/XLS/CSV locales detrás de la interfaz común de fuente de precios. Una adquisición remota futura, si se aprueba, vive como adapter separado y no altera el pipeline local.

No decide matching ni precedencia de pricing.

## `src/features/matching/**`

Implementa exclusivamente la escalera de matching, scoring/sugerencias permitidas y conservación de selección manual de sesión/batch.

No resuelve precios ni edita SVG.

## `src/domain/contracts/**`

Ubicación canónica y única de contratos compartidos entre workers/módulos. Contiene tipos y contratos, no lógica de negocio.

Esta ubicación ya existe y permanece estable. No se planifica migrarla a otra jerarquía: mantenerla evita churn de imports, preserva una sola fuente de verdad y no introduce movimiento estructural sin beneficio funcional.

No crear contratos equivalentes en otra ruta.

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

## `src/tokens/tokens.json`

Única fuente de verdad del sistema de design tokens.

Árbol canónico:

```text
foundation.*
semantic.*
component.*
```

Responsabilidades:

- `foundation.*`: valores base concretos y escalas.
- `semantic.*`: roles mediante aliases a foundation.
- `component.*`: decisiones de cada componente real mediante aliases a semantic/foundation.

Reglas de forma:

- token = objeto con `$value`;
- `$type` explícito o heredado inequívocamente;
- `$description` opcional;
- grupo = objeto sin `$value`;
- ningún objeto token puede tener hijos de grupo;
- aliases `{path.to.token}`;
- referencias válidas y sin ciclos;
- no duplicar valores si existe un alias correcto;
- usar tipos estándar disponibles (`color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`, `shadow`, `gradient`, `typography`).

El catálogo mínimo completo está definido en `docs/ARCHITECTURE.md` y sus gates en `docs/ROADMAP.md`.

## `src/tokens/tokens.css`

Bridge CSS generado/validado 1:1 desde `tokens.json`.

Reglas:

- nunca es fuente de verdad independiente;
- no contiene valores que no provengan del JSON;
- toda custom property debe mapear a un token fuente;
- todo token destinado a CSS debe producir su salida;
- nombres de custom properties deben ser deterministas y trazables al path del token;
- component CSS consume custom properties semánticas o de componente.

## `src/tokens/schema/**` opcional

Puede contener schema, fixtures de validación o definiciones auxiliares para verificar `tokens.json`.

No puede contener una copia de valores del catálogo. Su función es validar estructura, tipos, referencias, ciclos y reglas de salida, no convertirse en otra fuente de tokens.

## `src/styles/**`

Sólo reset/global realmente global y estilos que no pertenecen a una unidad visual concreta.

El bridge de tokens no vive aquí; su ubicación canónica es `src/tokens/tokens.css` junto a la fuente JSON.

No usar esta carpeta como depósito de estilos de componentes.

## `src/utils/normalize/**`

Normalizaciones puras y reutilizables. No debe transformarse en un contenedor genérico de lógica de negocio.

## `src/utils/parsing/**`

Parsing reusable de bajo nivel y utilidades de formato. Las decisiones de schema/fuente específicas deben vivir en adapters de `data-source` cuando corresponda.

## `src/workers/**`

Entrypoints/adapters de Web Workers necesarios por carga real. La lógica sustantiva sigue en módulos testeables y no se duplica dentro del worker.

## `src/main.ts`

Composition root mínimo. Registra/inicializa y conecta módulos. No contiene lógica de negocio ni markup/estilos principales.

## `tests/**`

Tests automatizados de unidad, integración y/o sistema según ownership W6. Incluye validaciones de schema/tipos/referencias de tokens, bridge CSS y auditorías de hardcodes cuando corresponda.

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
- Paths de token usan nombres propios del proyecto y jerarquía `foundation|semantic|component`.

## Patrones prohibidos por arquitectura visual

- `*.template.ts` como fuente principal de markup.
- `*.styles.ts` como fuente principal de CSS.
- Sass/SCSS.
- `css\`...\`` o arrays/strings TypeScript que construyan hojas de estilo principales.
- `html\`...\`` o strings TypeScript como markup estructural principal.
- CSS hardcodeado en TypeScript salvo valores dinámicos puntuales que no constituyan una hoja de estilos y estén justificados.
- valores visuales repetidos en component CSS cuando existe o debe existir token semántico/de componente.

La importación `?raw` de archivos `.html/.css` reales sí es válida porque preserva la separación de fuentes.
