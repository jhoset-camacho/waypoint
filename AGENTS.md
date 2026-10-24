# Waypoint/Gustave — Instrucciones para agentes

## Contexto y precedencia

- Producto/documentación: `/Users/jhoset/product/jh-product-waypoint`.
- Código: `/Users/jhoset/dev/jh-waypoint-react`; en worktrees, usar siempre la ruta explícita del encargo.
- Al iniciar, leer `ESTADO_ACTUAL.md` en producto. Es la fuente documental más reciente para decisiones, cambios, pendientes y estado de ejecución.
- Leer después `RDR.md`, `ARQUITECTURA.md`, los ADRs, contratos y el plan de ola aplicables. Si contradicen una decisión posterior de `ESTADO_ACTUAL.md`, prevalece esa decisión. Las instrucciones actuales de Jhoset tienen prioridad.
- El RDR describe producto consolidado; los deltas se registran primero en `ESTADO_ACTUAL.md` y sólo después se consolidan.
- Verificar código y pruebas antes de afirmar que algo está implementado o validado. Si código y documentación difieren, reportar la discrepancia.
- Antes de modificar código, leer `CLAUDE.md`, `_sistema/SISTEMA_TRABAJO_MULTIAGENTE.md` y `EJECUCION_Y_PROMPTS.md` en producto, además del encargo vigente.
- Preservar cambios locales existentes. No incluir secretos, datos personales ni dumps remotos en Git, entregas o respuestas.

## Flujo de trabajo

- Todo cambio de código usa una rama y un PR por objetivo; nunca push directo a `main`.
- Constructor y revisor son agentes o sesiones distintas. El constructor deja evidencia en `entregas/<ID>.md`; sólo el coordinador actualiza `ESTADO_ACTUAL.md` después de revisión.
- Una ola declara dependencias, turnos y propiedad exclusiva de archivos en `olas/<OLA>/PLAN.md`.
- Los contratos compartidos se integran antes de paralelizar consumidores.
- Merge, deploy y validación de producto son gates separados. Riesgo rojo requiere autorización explícita de Jhoset.
- Usar las skills locales `waypoint-planificar-ola`, `waypoint-revisar-cambio` y `waypoint-listo-para-integrar` cuando corresponda. No conceden permiso de push, merge o deploy.

## Dirección vigente de producto

- La app y el agente se llaman **Gustave**; Waypoint es sólo el nombre clave interno.
- El contrato aceptado es `contratos/CONTRATO_AGENTE_APLICACION_V1.md`.
- El front final se porta fielmente desde `prototipos/gustave-mvp-v2/` a React Native. Cambia la tecnología interna, no la dirección visual o de interacción.
- V4 Plum `#311B33` es la referencia visual; producto, copy y flujos vigentes mandan sobre materiales históricos.
- El trabajo nuevo sigue `PLAN_IMPLEMENTACION_MVP_GUSTAVE.md` y el plan de ola activo.

