# Treasure Hunt · integración CRM

## Estado COR-191 — 22/09/2026

El proxy CRM y el Worker `corsteno-api` están desplegados en producción y apuntan al Worker productivo de Treasure Hunt. Los secrets server-side esperados están cargados por nombre; no se documentan valores. No se aplicaron migraciones al D1 existente del CRM ni se configuró DNS.

## Estado del flujo

El CRM expone Búsqueda del Tesoro bajo `/admin/treasure-hunt/*` y mantiene la credencial del servicio exclusivamente en `apps/api`. El navegador sólo usa la sesión CRM y el `X-Organization-Id`; nunca recibe `TREASURE_HUNT_ADMIN_TOKEN`.

El proxy traduce estas operaciones al Worker administrativo:

- listar, consultar y guardar campañas/borradores;
- cargar, previsualizar, actualizar y quitar objetivos;
- iniciar compilación con `BROWSER_COMPILATION_REQUIRED`;
- subir el artifact binario `application/octet-stream` asociado a `compilationId`;
- consultar el estado de la compilación;
- publicar con `If-Match` e `Idempotency-Key`.
- canjear un reward desde una sesión CRM autorizada mediante `/admin/treasure-hunt/rewards/redeem`.

Las respuestas 4xx del Worker se conservan para que el editor pueda mostrar validaciones, conflictos de revisión y bloqueos de readiness. Los errores de conectividad o respuestas 5xx se presentan como servicio no disponible.

## Compilación browser-side

`apps/web/src/features/treasure-hunt/browserCompiler.ts` usa `@tracear/sdk@0.2.1` (`compileImage` y `packMarkers`). Descarga cada original a través del proxy CRM, compila en el navegador, empaqueta los markers y entrega el artifact al Worker. El backend continúa siendo autoridad para tamaño, formato, checksum, mapping, revisión y publicación.

El editor muestra las etapas `preparando`, `compilando`, `subiendo`, `validando`, `éxito` y `error`. Publicar exige un borrador guardado, readiness `READY`, artifact compilado para la revisión actual, confirmación explícita e idempotencia.

## Variables y entornos

El código espera en el API del CRM:

- `TREASURE_HUNT_ADMIN_API_URL`
- `TREASURE_HUNT_ADMIN_TOKEN`
- `TREASURE_HUNT_REDEMPTION_TOKEN`

Los valores locales se mantienen en archivos ignorados por Git. Este cambio no agrega valores, secrets, bindings ni migraciones. El build del web local requiere `VITE_RUNTIME_BASE_URL` porque es una condición existente de producción; se puede proporcionar como variable de proceso durante una verificación local.

`TREASURE_HUNT_ADMIN_TOKEN` y `TREASURE_HUNT_REDEMPTION_TOKEN` son credenciales server-side distintas. El CRM nunca las devuelve al browser: para redemption deriva `X-PEC-Operator-Id` de la sesión autenticada, deriva `X-Organization-Id` del contexto activo y mapea el permiso CRM `claims.redeem` al permiso upstream `rewards.redeem`.

El cambio se verificó con tests del límite server-side, typecheck, lint y build local. El smoke productivo validó el Worker administrativo/redemption directamente y el health del CRM; la validación de la sesión autenticada real de la UI CRM/PEC queda como gate manual. No se configuró DNS ni se modificó el D1 existente del CRM.
