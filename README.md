# Corsteno CRM

Fundación técnica del futuro CRM interno y portal de clientes de Corsteno. Esta etapa mantiene el alcance deliberadamente pequeño: una web React que verifica la disponibilidad de una API Cloudflare Worker.

## Arquitectura

- `apps/web`: React + Vite, preparado para `crm.corsteno.com`.
- `apps/api`: TypeScript + Hono sobre Cloudflare Workers, preparado para `api.corsteno.com`.
- `packages/types`: contratos compartidos entre frontend y backend.

Hono se utiliza por ser un router pequeño, tipado y compatible con Workers, sin introducir un servidor tradicional. La futura multi-tenancy se incorporará en servicios y acceso a datos; no hay organizaciones ni tablas en esta etapa.

## Database

La base local usa Cloudflare D1 (SQLite) y Drizzle ORM. El schema está en `apps/api/src/db/schema.ts` y la primera migración en `apps/api/src/db/migrations/`. Los IDs son UUID strings generados en runtime; los timestamps se guardan como epoch milliseconds de SQLite. `events.properties` es JSON serializado en una columna SQLite. `crm_notes` usa una relación polimórfica (`entity_type` + `entity_id`) para mantener notas simples sin crear una tabla por tipo de entidad.

Modelo: organizations tienen memberships, projects y CRM; projects contienen applications, events y prizes; users pueden pertenecer a múltiples organizations mediante memberships. Los eventos y claims preservan historia y no tienen borrado en cascada general.

Toda query tenant-specific debe filtrar por `organization_id` además del identificador de la entidad. Nunca se debe confiar en un ID aislado ni aceptar el organization_id de un usuario público; en etapas futuras se derivará de membership o credencial de application.

## Requisitos e instalación

Node.js 20+ y pnpm 9+.

```bash
pnpm install
pnpm dev
```

Esto levanta Vite en `http://localhost:5173` y Wrangler en `http://localhost:8787`. El frontend centraliza la URL de API en `VITE_API_URL`: el fallback de código conserva `http://localhost:8787`, mientras que `apps/web/.env.local` usa `https://localhost:8787` para el desarrollo HTTPS. Los archivos `.env.local` no se commitean.

### API local HTTPS (Cosquín AR)

Para usar el CRM en el modo WebAR/HTTPS, ejecutar:

```bash
pnpm --filter @corsteno/api dev:https
pnpm --filter @corsteno/web dev:https
```

Las URLs son:

- CRM: `https://localhost:5173`
- API: `https://localhost:8787`
- Cosquín: `https://localhost:5175`

Para el modo simple HTTP:

```bash
pnpm --filter @corsteno/api dev
pnpm --filter @corsteno/web dev
```

En modo HTTPS la cookie de sesión es `HttpOnly; Secure; SameSite=Lax; Path=/`. En modo HTTP local se omite `Secure` para conservar el flujo existente; en producción se fuerza `Secure`. No se define `Domain`, y el frontend usa `credentials: 'include'`.

En desarrollo, CORS permite explícitamente `https://localhost:5173`, `https://localhost:5175`, `http://localhost:5173` y `http://localhost:5175`, además de los orígenes configurados en `WEB_ORIGIN` (separados por comas). CORS conserva `credentials: true`, permite `Content-Type`, `X-Organization-Id` y `Authorization`, y no utiliza `*`.

## Verificación

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Base de datos local:

```bash
pnpm db:generate
pnpm db:migrate:local
pnpm db:seed:local
```

`pnpm db:migrate:local` crea/aplica la base simulada local de Wrangler; no ejecuta nada productivo. El seed agrega solo Corsteno y Cosquín Rock. Para inspeccionarla puede usarse `wrangler d1 execute corsteno-db --local --command="SELECT * FROM organizations"`.

`GET /dev/db-check` devuelve el estado y el conteo de organizations únicamente cuando `ENVIRONMENT=development`; en otros entornos responde 404.

También se puede comprobar `GET http://localhost:8787/health`. El frontend consulta ese endpoint realmente y muestra el estado recibido.

## Entorno y Cloudflare

No se incluyen secretos, IDs ni dominios reales. Wrangler usa variables locales seguras por defecto; las variables sensibles futuras deberán configurarse como secrets. En una etapa posterior se configurarán Worker, `api.corsteno.com`, `crm.corsteno.com`, D1, bindings y migraciones. R2 también queda reservado para archivos/exportaciones/assets, sin binding todavía.

La capa futura de eventos/analytics cubrirá eventos como `app_opened`, `game_started`, `game_finished`, `prize_won` y `prize_claimed`, pero no se implementa aquí. D1, auth, usuarios, organizaciones, permisos, CRM y dashboards pertenecen a etapas posteriores.

En producción, **D1 todavía NO está configurado**: habrá que crear la base, reemplazar el placeholder `database_id` en Wrangler y configurar el binding/entorno sin subir secretos al repositorio.

## Próxima etapa

**ETAPA 2 — diseño del modelo de datos multi-tenant y preparación de Cloudflare D1.**
