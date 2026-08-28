# precios

Herramienta frontend-only y offline-first para preparar piezas SVG con precios NORMAL y ÉMINENT a partir de fuentes de datos trazables, manteniendo el procesamiento principal en el navegador y sin backend obligatorio.

## Estado

El repositorio acaba de inicializarse. Esta primera fase define arquitectura y contratos compartidos; todavía no incorpora build, dependencias, UI ni engines productivos.

## Arquitectura base

La dirección acordada es Vite + TypeScript estricto + Web Components, con componentes UI desacoplados y un design system local donde corresponda. El pipeline local separa fuentes de datos, adaptación de esquema, matching, resolución de precios, SVG/fuentes, preflight, preview, exportación y QA.

La arquitectura detallada está en `docs/architecture/architecture.md` y los contratos compartidos en `src/domain/contracts/`.

## Ownership por worker

- W1: arquitectura, documentación base y contratos compartidos.
- W2: fuentes/datos, adaptación de esquema, matching y pricing según contratos consolidados.
- W3: análisis y engine SVG/fuentes según contratos consolidados.
- W4: preview/UI.
- W5: toolchain, dependencias, build, packaging y handoff.
- W6: QA, fixtures y validaciones de regresión.

Las fronteras pueden refinarse por el orquestador, pero los módulos deben consumir los contratos compartidos en lugar de duplicar entidades.