# Etapa 3C — integración externa en dry-run

## Estado

La implementación está preparada, pero no se desplegó el API Worker ni se ejecutó el smoke E2E. La etapa queda `NO-GO` para 3D hasta provisionar credenciales de runtime y completar una ejecución real.

## Infraestructura Cloudflare

Queue creada:

- nombre: `corsteno-finder-jobs`
- id: `8aeabeecddb84840801c152c3e1afb75`
- consumidor: HTTP Pull
- batch: 1
- visibility timeout: 120 segundos
- retries: 3
- retry delay: 30 segundos

La queue existente `corsteno-lead-jobs` no fue modificada.

Comandos utilizados:

```powershell
pnpm --filter @corsteno/api exec wrangler queues create corsteno-finder-jobs
pnpm --filter @corsteno/api exec wrangler queues consumer http add corsteno-finder-jobs --batch-size 1 --message-retries 3 --visibility-timeout-secs 120 --retry-delay-secs 30
```

El binding producer queda declarado en `apps/api/wrangler.toml` como `FINDER_JOB_QUEUE`. Será efectivo en Cloudflare recién después de desplegar `corsteno-api`.

## Contrato

El mensaje Queue es mínimo:

```json
{"version":1,"jobId":"...","organizationId":"..."}
```

El backend carga el Job desde D1. Python no elige el tenant: el backend compara el `organizationId` del mensaje contra el Job real y rechaza diferencias.

El runner decodifica el formato Cloudflare según `CF-Content-Type`: JSON/bytes base64 y text UTF-8. Usa `batch_size=1`, hace claim atómico, ejecuta Finder, envía un batch de candidatos sin persistirlos, completa el Job y recién entonces hace ACK.

## API interna

Implementada bajo `/internal/finder/jobs/:id`:

- `claim`
- `progress`
- `batch`
- `complete`
- `fail`

Las llamadas usan HMAC-SHA256 sobre método, path, timestamp y hash SHA-256 del body. La ventana temporal es de cinco minutos. No se usan cookies, sesiones ni credenciales admin.

## Provisionamiento pendiente

Se requieren credenciales separadas:

1. `CF_QUEUES_API_TOKEN`: token Cloudflare de cuenta con Queues read/write, usado sólo por el runner para pull/ACK.
2. `FINDER_SERVICE_SECRET`: secreto HMAC compartido entre el Worker y el runner.

No se guardan en Git, `.env` versionado, Queue, D1 ni logs. Ver `services/finder/.env.example`.

Para completar el despliegue, provisionar `FINDER_SERVICE_SECRET` en el Worker mediante `wrangler secret put` y configurar las mismas variables sólo en la sesión local del runner. Luego desplegar el API Worker y ejecutar `python -m finder runner pull-once`.

Etapa 3C no inserta filas en `leads`; únicamente almacena métricas seguras en `lead_jobs.metadata`.
