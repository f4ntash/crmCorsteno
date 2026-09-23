# Finder con GitHub Actions — POC manual

Esta POC reemplaza temporalmente el proceso persistente de Finder por una ejecución manual de GitHub Actions. No conecta Cloudflare automáticamente y no habilita producción.

## Flujo

```text
workflow_dispatch(job_id)
  → GitHub-hosted ubuntu-latest
  → Python 3.11 + Playwright + Chromium
  → Finder runner pull-once --job-id
  → Cloudflare Queue HTTP pull
  → claim / batch / complete / ACK
```

El workflow está en `.github/workflows/finder-poc.yml` y sólo tiene el trigger `workflow_dispatch`. La ejecución recibe un `job_id`, hace pull de un único mensaje y sólo lo procesa si el `jobId` coincide exactamente. Un mensaje distinto se reintenta y la Action falla sin ejecutarlo.

El cambio en `services/finder` es deliberadamente pequeño: el runner conserva Playwright, callbacks, claim, persistencia, deduplicación y manejo de errores existentes. Sólo se añadió el filtro seguro por `job_id` y el modo `--require-job` para que una Action no termine exitosamente sin haber encontrado el job solicitado.

## Secrets de la POC

Configurar en GitHub Actions Secrets, usando exclusivamente recursos no productivos:

- `FINDER_POC_API_BASE_URL`
- `FINDER_POC_CF_ACCOUNT_ID`
- `FINDER_POC_CF_FINDER_QUEUE_ID`
- `FINDER_POC_CF_QUEUES_API_TOKEN`
- `FINDER_POC_SERVICE_SECRET`

El workflow no usa ni referencia secretos productivos. `FINDER_POC_CF_QUEUES_API_TOKEN` requiere permisos de lectura/escritura de Queues sobre la cuenta de prueba. `FINDER_POC_SERVICE_SECRET` debe coincidir con el secreto HMAC del API no productivo.

No hay un API staging actualmente disponible en este repositorio. Para una ejecución real de la POC se necesita una URL no productiva accesible desde GitHub-hosted runners y una Queue no productiva con un job sintético.

## Ejecución manual

1. Publicar el workflow en la rama default del repositorio.
2. Configurar los cinco secrets `FINDER_POC_*`.
3. Crear un job sintético en el API/Queue no productivos y conservar su `job_id`.
4. Ejecutar `Finder POC` desde Actions con ese `job_id`.
5. Verificar en los logs: instalación de Chromium, `claim`, ejecución, callbacks, `complete` y ACK.

La entrada `workflow_dispatch` sólo aparece cuando el workflow está en la rama default. No debe usarse con un `job_id` de producción: el workflow rechaza explícitamente la URL y el ID de Queue productivos conocidos.

## Costos y límite

El workflow usa únicamente `ubuntu-latest`, un runner GitHub-hosted estándar. No usa larger runners, self-hosted runners, schedules, matrices, cache ni artifacts.

`timeout-minutes: 20` limita una ejecución individual, pero no es un hard stop de facturación. El owner de GitHub debe configurar el presupuesto de Actions con `Stop usage when budget limit is reached` y verificar la cuota incluida antes de habilitar cualquier integración automática. Mientras esa protección de cuenta no esté confirmada, esta POC debe permanecer manual y fuera de producción.

## Integración futura propuesta

No implementada en esta etapa:

```text
corsteno-finder-jobs
  → dispatcher controlado
  → workflow_dispatch con job_id
  → GitHub Actions
  → runner Python
  → callbacks API
```

El dispatcher debería conservar la Queue como buffer/retry, garantizar idempotencia por `job_id`, evitar ejecuciones concurrentes del mismo job y no exponer secretos al CRM o al navegador.
