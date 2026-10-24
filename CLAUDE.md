# Gustave — Guía técnica del repositorio

Aplicación móvil Expo/React Native para planear y vivir viajes con un agente concierge. La app y el agente se llaman **Gustave**; **Waypoint** es sólo el nombre clave interno del repositorio.

## Fuente de verdad

Leer, en este orden, antes de cambiar código:

1. `/Users/jhoset/product/jh-product-waypoint/ESTADO_ACTUAL.md`.
2. `AGENTS.md` en este repositorio.
3. ADR, contrato y `olas/<OLA>/PLAN.md` aplicables en producto.
4. El encargo vigente y sus criterios de aceptación.

El RDR y la arquitectura pueden contener decisiones históricas. Una decisión posterior de `ESTADO_ACTUAL.md` o de Jhoset prevalece.

## Stack conservado

- Expo SDK 56, React Native, TypeScript estricto y Expo Router.
- React Query, SecureStore, Reanimated y `react-native-maps`.
- Supabase Auth, Postgres, Storage, Realtime y Edge Functions Deno/TypeScript.
- Google Places y Distance Matrix detrás de adaptadores de servidor.

No cambiar el stack por conveniencia local. Una sustitución material requiere ADR y aprobación.

## Convenciones

- UI y copy en español; código, identificadores y base de datos en inglés.
- Regenerar `supabase/types/database.ts` después de integrar cambios de esquema, con un solo dueño por ola.
- `npx tsc --noEmit` debe pasar.
- Secrets sólo en entornos locales o Supabase; nunca en cliente, Git, fixtures o evidencia.
- No modificar migraciones aplicadas. Toda evolución usa una migración aditiva y prueba instalación limpia + upgrade.
- No resetear Supabase remoto ni desplegar como parte implícita de un PR.

## Invariantes V1

- Gustave puede investigar y proponer; no escribe estado compartido directamente desde texto del modelo.
- Guardar, elegir alojamiento, añadir al viaje, planear y visitar son relaciones distintas.
- Una propuesta es inmutable; aprobar aplica exactamente lo visible, con autoridad, precondiciones e idempotencia.
- El estado relacional es canónico. Mensajes y resúmenes no prueban que una acción ocurrió.
- Preferencias de personas distintas permanecen separadas.
- El MVP expone chat grupal y conserva compatibilidad de datos para un futuro chat personal.
- Roles: `organizer`, `participant`, `viewer`; autorización y visibilidad se hacen cumplir en servidor/RLS.
- Datos sensibles se minimizan y no se propagan innecesariamente a memoria, resúmenes, logs o analítica.

## Front final

La referencia observable está en `/Users/jhoset/product/jh-product-waypoint/prototipos/gustave-mvp-v2/` y sus capturas finales. Se debe replicar jerarquía, composición, copy, estados, navegación y respuesta táctil.

La demo web **se porta** a componentes React Native; no se incrusta en WebView ni se importa su HTML/CSS. Cualquier diferencia necesaria por plataforma, accesibilidad o mapas se documenta y pasa por el gate visual de Jhoset.

Los componentes consumen unidades y acciones tipadas del contrato V1. Nunca interpretan copy libre para decidir botones o mutaciones.

## Flujo multiagente

- Una rama y un PR por objetivo; no push directo a `main`.
- Constructor y revisor independientes.
- Respetar archivos propios, dependencias y turnos del plan de ola.
- Registrar evidencia en producto; el ejecutor no edita `ESTADO_ACTUAL.md`.
- Merge y deploy son decisiones separadas.

## Verificación mínima

Según el alcance del PR:

```bash
npm ci
npx tsc --noEmit
git diff --check
```

Agregar pruebas focalizadas de contrato, migración, RLS, UI o Edge Functions. Compilar no acredita integración remota ni aceptación visual.

