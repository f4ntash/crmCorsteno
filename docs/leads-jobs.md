# Leads · Job Runner (Etapa 2)

La Etapa 2.5 usa Cloudflare Queues con el Worker actual como producer y consumer. La request HTTP crea y persiste el job en D1 como `QUEUED`, publica un mensaje mínimo `{ version, jobId, organizationId }` y responde rápidamente. El consumer carga el estado real desde D1 y delega en el runner. La Queue no es fuente de verdad de negocio.

Se eliminó `waitUntil()` para el procesamiento principal. La Queue es adecuada para retries, redelivery y cierre del navegador. La configuración inicial es conservadora: batch de 5 mensajes, timeout de 5 segundos, un consumer concurrente y DLQ `corsteno-lead-jobs-dlq`. El enqueue ocurre después del insert D1; si falla, el job se marca `FAILED` y la API devuelve un error explícito.

## Concurrencia, acknowledgements y cancelación

El runner reclama un job con un `UPDATE` atómico condicionado por `status='QUEUED'` y `organization_id`. Una segunda entrega no puede reclamar el mismo job. Cada handler consulta cancelación entre lotes; el endpoint de cancelación solo cambia jobs `QUEUED` o `RUNNING` y el runner deja de avanzar cuando observa `CANCELLED`.

El consumer hace `ack()` individual para mensajes inválidos, inexistentes, duplicados, completados o cancelados. Los errores inesperados del adaptador hacen `retry()`, usando la política de reintentos de Cloudflare; después de agotarlos, el mensaje queda en la DLQ. Los errores de dominio capturados por el runner se persisten como `FAILED` y se reconocen para evitar loops inútiles.

## Handler registry

Los handlers viven en `apps/api/src/services/lead-jobs.ts`. El único handler habilitado es `FINDER` con `metadata.mode = "test"`; procesa pasos simulados, no crea leads y no llama servicios externos. La capa expone `registerLeadJobHandler()` para registrar Finder, Enricher o Scoring en etapas posteriores.

## Límites

- 3 jobs activos por organización.
- Metadata de hasta 8 KiB.
- Hasta 500 pasos por job de prueba.
- El frontend refresca cada 2,5 segundos únicamente mientras hay jobs `QUEUED` o `RUNNING`.

## Cloudflare

Crear una vez los recursos antes del deploy:

```bash
pnpm --filter @corsteno/api exec wrangler queues create corsteno-lead-jobs
pnpm --filter @corsteno/api exec wrangler queues create corsteno-lead-jobs-dlq
pnpm --filter @corsteno/api dev
```

El producer binding y consumer están en `apps/api/wrangler.toml`. Wrangler local emula las Queue bindings al ejecutar el Worker con `wrangler dev --local`; el test de la aplicación usa un producer fake y los tests del adapter ejercitan ack/retry sin red. Para verificar que ambas queues existen en producción se usa `wrangler queues list`; la inspección de mensajes de la DLQ se realiza desde la consola de Cloudflare y el reproceso debe hacerse manualmente publicando nuevamente el payload mínimo luego de verificar el job en D1.

Para trabajos que superen una invocación razonable, el handler debe procesar un lote, persistir progreso, consultar cancelación y publicar un mensaje de continuación con el mismo `jobId`. No se implementa esa continuación hasta Finder real.
