# AGENTS.md

## Propósito

Este archivo define reglas operativas permanentes para cualquier worker o agente que intervenga en `krestosa/precios`. La fuente de verdad arquitectónica está en `docs/ARCHITECTURE.md`, la estructura canónica en `docs/DIRECTORY_STRUCTURE.md`, las reglas de desarrollo en `docs/DEVELOPMENT_RULES.md`, el orden de trabajo en `docs/ROADMAP.md` y las decisiones congeladas o pendientes en `docs/DECISIONS.md`.

## Reglas obligatorias

- Trabajar siempre en branch dedicada desde la base explícitamente asignada. No modificar `main` directamente.
- No usar force push, rewrite, rebase destructivo ni GitHub Web Editor. GitHub Actions sólo puede ser modificado o ejecutado cuando la tarea lo autorice expresamente y dentro del ownership correspondiente.
- Respetar ownership por worker. Si un cambio requiere un archivo ajeno, emitir `DEPENDENCY REQUEST`; no editarlo por conveniencia.
- `src/domain/contracts/**` es la ubicación canónica y única de contratos compartidos. No crear una segunda jerarquía equivalente ni mover contratos por razones estéticas: se priorizan estabilidad de imports, una sola fuente de verdad y ausencia de churn sin beneficio funcional.
- No duplicar lógica de dominio entre módulos. Consumir contratos y APIs públicas existentes.
- Mantener el pipeline browser local/offline-first: parsing de fuente, matching, pricing, SVG, fuentes, preflight y export no dependen de credenciales frontend ni de un backend obligatorio.
- No inventar precedencia de precios, fallbacks, herencias de blancos ni reinterpretaciones de placeholders. `$$$$` significa NORMAL y `@@@@` significa ÉMINENT, exactamente.
- Un match ambiguo requiere intervención humana. Fuzzy sólo produce sugerencias.
- SVG/XML se modifica quirúrgicamente: sólo targets de precio seguros; nunca paths por heurística ni reserialización global evitable.
- La UI no reimplementa parsing, pricing, matching ni engine SVG.
- Cada unidad visual reusable usa archivos reales separados `.html`, `.css`, `.ts` en su carpeta, más `index.ts` cuando corresponda. No usar `.template.ts`, `.styles.ts`, Sass/SCSS, `css\`...\``, `html\`...\`` ni generar el markup/estilo principal desde TypeScript.
- `src/tokens/tokens.json` es la única fuente de verdad de design tokens. Usa tres capas propias: `foundation.*`, `semantic.*` y `component.*`; aliases antes que duplicación, referencias sin ciclos y tipos explícitos o heredados inequívocamente.
- `src/tokens/tokens.css` es un bridge generado/validado 1:1 desde JSON, nunca una segunda fuente de verdad. Component CSS consume custom properties semánticas o de componente.
- Los outputs deben ser deterministas: mismos inputs y configuración funcional producen el mismo contenido funcional. Metadata temporal opcional no debe alterar decisiones ni hashes funcionales.
- Mantener errores por archivo cuando sea posible: un SVG inválido no debe bloquear la exportación de archivos válidos.
- Antes de cerrar una tarea: verificar diff exacto contra la base, archivos fuera de ownership, tests/validaciones aplicables y pendientes reales.

## Ownership

- W1: `AGENTS.md`, `docs/**` y contratos/arquitectura sólo cuando la tarea lo autorice expresamente.
- W2: `src/features/data-source/**`, `src/features/matching/**`, `src/domain/pricing/**`, `src/utils/normalize/**`, `src/utils/parsing/**`.
- W3: `src/features/svg-engine/**`, `src/features/font-resolver/**`, `src/features/export/**`, `src/workers/**`.
- W4: `src/components/**`, `src/features/ui/**`, `src/layout/**`, `src/styles/**`, `src/tokens/**`.
- W5: `handoff/**`, `scripts/**`, `.github/workflows/**`, build configs, package y lockfile.
- W6: `tests/**`, `fixtures/**`, `sample-data/**`.
- Integración: branch/worker dedicado; sólo composition root, adapters de integración y conflictos explícitamente autorizados. No existe una migración prevista de `src/domain/contracts/**` a otra ruta.

## Cierre

Ninguna branch de worker se considera integrada por existir o por estar completa. La integración sólo ocurre mediante una tarea dedicada que valide contratos, ownership, QA y gates del roadmap.
