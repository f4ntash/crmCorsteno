# Corsteno — Manual QA maestro

> Estado: guía de aceptación manual para el estado actual del repositorio. No es una certificación WCAG, de seguridad ni de performance. Las casillas se completan durante una ejecución real.

## Leyenda y registro de ejecución

- `[ ]` No probado
- `[x]` Pasó
- `[!]` Falló — agregar `FAIL: descripción`
- `[-]` No aplica / entorno no disponible

Campos de ejecución: fecha: ______  tester: ______  commit: ______  browser/versión: ______  OS: ______  API: ______  CRM: ______  runtime: ______

## Feature Index

```text
Corsteno
├── Autenticación y sesión
├── Organizaciones y equipo
├── Home / Resumen
├── Experiencias
│   ├── Roulette
│   └── Catálogo de productos
├── Productos canónicos
│   ├── contenido, publicación, stock y galería
│   └── configuración 3D / GLB (operador de plataforma)
├── Sitios y canales
│   ├── external_site
│   ├── corsteno_site
│   └── hosted_runtime
├── Contenido editable marketing-basic-v1
├── Runtime público y QR
├── Public API v1
├── @corsteno/client
├── @corsteno/analytics-client
├── Site generator / site-starter
├── Analytics / Resultados
├── Atención
├── Reportes CSV
├── Actividad
├── Archivos / R2
├── Comercial, planes, suscripciones, pagos y grants
└── Prototipos y app legacy (no son el runtime montado)
```

## AUDIT SUMMARY

- Apps: **3** — `apps/api`, `apps/web`, `apps/runtime`.
- Paquetes workspace relevantes: **5** — `types`, `client`, `analytics-client`, `roulette-3d`, `site-generator`.
- Migraciones SQL: **27**, `0000` a `0026`, en orden lexicográfico/numerado.
- Tipos de experiencia registrados: **2** — `roulette`, `product-catalog`.
- Templates: **4** — tres Roulette y uno de catálogo.
- Tipos de canal: **3** — `external_site`, `corsteno_site`, `hosted_runtime`.
- Roles de organización: **5** — `owner`, `admin`, `member`, `viewer`, `operator`.
- Roles de plataforma observados: **3** — `super_admin`, `corsteno_admin`, `user`.
- Endpoints públicos de producto/sitio/experiencia/assets: **8** — 5 bajo `/public/v1/sites` (incluye `assets/:assetId`), 1 GET de experiencia, 1 spin y 1 events; el proxy interno `/assets/*` se cuenta aparte.
- Áreas funcionales principales: **18** (las ramas del índice, excluyendo prototipos y legacy).
- Escenarios manuales definidos: **128** — P0: 24, P1: 62, P2: 34, P3: 8.

La evidencia se auditó en rutas, registries, servicios, migraciones, tests, scripts y documentación. Fuentes principales: `apps/web/src/app/App.tsx`, `apps/api/src/index.ts`, `apps/api/src/auth/*`, `apps/api/src/services/*`, `apps/api/src/db/migrations/*`, `packages/types/src/*`, `templates/site-starter/*`.

## 1. Inventario del sistema

| Área | Propósito | Evidencia | Estado QA |
|---|---|---|---|
| `apps/api` | Worker Hono/Cloudflare; auth, D1, R2, CRM, API pública, billing | `apps/api/src/index.ts`, `routes/*` | [ ] |
| `apps/web` | CRM React/Vite, navegación y editores | `apps/web/src/app/App.tsx`, `features/*` | [ ] |
| `apps/runtime` | Runtime público de Roulette y catálogo | `apps/runtime/src/App.tsx`, `renderers/registry.tsx` | [ ] |
| `packages/types` | Tipos y validaciones compartidas | `packages/types/src/*` | [ ] |
| `packages/client` | Cliente SDK de eventos autenticado por credential | `packages/client/src/index.ts` | [ ] |
| `packages/analytics-client` | Cliente de analytics/events | `packages/analytics-client/src/index.ts` | [ ] |
| `packages/roulette-3d` | Render de rueda 3D reusable | `packages/roulette-3d/src/*` | [ ] |
| `packages/site-generator` | Genera proyecto Vite desde `templates/site-starter` | `packages/site-generator/src/*` | [ ] |
| `templates/site-starter` | Sitio público React con home, productos, detalle, galería y 3D | `templates/site-starter/src/*` | [ ] |
| `scripts` | seed/reset/demo/local/prod bootstrap; no son UI | `scripts/*` | [ ] |
| `docs` | documentación existente y este manual | `docs/*` | [ ] |

`prototypes/` contiene prototipos visuales y material de exploración; no está cableado en `apps/web` ni `apps/runtime` y no debe tomarse como funcionalidad aceptable.

## 2. Setup local exacto

Prerequisitos observados: Node compatible con el lockfile, pnpm 9.15.4, Cloudflare Wrangler y acceso local a R2/D1 simulado por Wrangler.

```powershell
pnpm install
pnpm db:migrate:local
pnpm db:seed:local
pnpm seed:local
pnpm dev
```

`pnpm dev` inicia API y web en paralelo. El API usa Wrangler local con `--env development`; el puerto esperado por configuración/documentación es `http://localhost:8787`. Vite web usa el puerto estándar `5173`. Runtime se inicia aparte:

```powershell
pnpm --filter @corsteno/runtime dev
```

Su puerto esperado es `5174`. Para generar un sitio:

```powershell
pnpm create:site -- --slug qa-site --site-key <SITE_KEY> --api-url http://localhost:8787 --out .\generated\qa-site
pnpm --dir .\generated\qa-site install
pnpm --dir .\generated\qa-site dev
```

Verificar la sintaxis exacta de opciones del CLI antes de ejecutar; el script real es `packages/site-generator/src/cli.ts`. No usar scripts de producción para esta corrida: `db:bootstrap:production` y `credentials:create-production` quedan fuera de alcance.

Variables/bindings auditadas: `ENVIRONMENT`, `APP_VERSION`, `WEB_ORIGIN(S)`, `PUBLIC_ORIGINS`, `LOCAL_ACCEPTANCE_PRIZE_ID`, D1 `DB`, R2 `EXPERIENCE_ASSETS`, y variables de Mercado Pago/webhooks. Web usa `VITE_API_URL` y `VITE_RUNTIME_BASE_URL`; starter usa `VITE_CORSTENO_API_URL` y `VITE_CORSTENO_SITE_KEY`. Confirmar valores en `.env` local sin commitearlos.

**ENV-01 — instalación y versiones [P0]**

- [ ] Ejecutar `pnpm install` sin errores.
- [ ] Registrar commit y versiones de Node/pnpm/Wrangler.
- [ ] Resultado esperado: lockfile respetado y ningún secreto pedido por la instalación.

**ENV-02 — D1 local [P0]**

- [ ] Ejecutar migraciones y luego seed local.
- [ ] Abrir `/dev/db-check` en desarrollo.
- [ ] Esperado: respuesta `database: ok`; no ejecutar este endpoint fuera de development.

**ENV-03 — tres procesos [P1]**

- [ ] Iniciar API, CRM y runtime; abrir sus URLs.
- [ ] Esperado: API responde `/health`, CRM muestra login, runtime compila sin error.

## 3. Base de datos

### Migraciones en orden

| Migración | Objeto/propósito | Clasificación |
|---|---|---|
| 0000 | usuarios, sesiones, organizaciones, membresías, proyectos, aplicaciones, eventos | activa/canónica base |
| 0001 | ajustes base del esquema inicial | compatibilidad/base histórica |
| 0002 | credenciales de aplicaciones | activa |
| 0003 | `application_type` | activa |
| 0004 | experiencias | activa |
| 0005 | estado persistido de experiencia | activa |
| 0006–0007 | inventario de premios v1/v2 | v2 canónica; v1 histórica |
| 0008 | aplicación de analytics de experiencias | activa |
| 0009 | spins | activa |
| 0010 | límites de participación | activa |
| 0011 | claims de premios | activa |
| 0012 | períodos de acceso | activa |
| 0013–0017 | planes, suscripciones, pagos, catálogo comercial, grants y entitlements | activa/comercial |
| 0018 | actividad por organización | activa |
| 0019 | assets de organización | activa |
| 0020 | catálogo de productos por experiencia | legacy de catálogo; fallback/compatibilidad |
| 0021 | galerías y orden de catálogo | legacy de catálogo |
| 0022 | sitios y canales | activa |
| 0023 | contenido de canal publicado/borrador | activa |
| 0024 | productos first-class | canónica actual |
| 0025 | configuración 3D de producto | canónica actual |
| 0026 | API pública de sitios | activa |

### Tablas de negocio observadas

**Activas/canónicas:** `users`, `auth_sessions`, `organizations`, `memberships`, `projects`, `applications`, `application_credentials`, `events`, `experiences`, `experience_spins`, `experience_participation`, `experience_prize_inventory`, `experience_prize_inventory_events`, `roulette_prize_claims`, `experience_access_periods`, `plans`, `subscriptions`, `subscription_periods`, `subscription_experiences`, `commercial_payments`, `commercial_grants`, `subscription_feature_entitlements`, `organization_activity`, `organization_assets`, `products`, `product_published_images`, `product_3d_config`, `channels`, `channel_experiences`, `channel_published_products`, `channel_content`.

**Legacy/compatibilidad:** `catalog_products`, `catalog_product_images`, `catalog_galleries`, `catalog_gallery_items` y estructuras antiguas de inventario/catalogación que permanecen por migraciones y fallback. No eliminarlas durante QA. La implementación actual intenta usar first-class products cuando está disponible, pero conserva rutas de catálogo legacy.

Propiedad: cada entidad comercial relevante está acotada por `organization_id`; las relaciones de proyecto/aplicación, experiencia/canal, producto/canal y asset también deben conservar ese scope. El ciclo general es crear → editar draft → publicar/activar → consumir; archive/deactivate/unlink conserva datos históricos donde el código lo indica.

**DB-01 — migraciones completas [P0]**

- [ ] Aplicar las 27 migraciones sobre D1 local desde cero.
- [ ] Esperado: todas aplican en orden y no aparecen tablas faltantes.

**DB-02 — legacy no rompe canónica [P1]**

- [ ] Ejecutar seed/demo con productos first-class y, si el fixture lo permite, datos legacy.
- [ ] Esperado: Products y Catalog no mezclan registros entre organizaciones y las asociaciones históricas permanecen.

## 4. Roles, permisos y aislamiento

El permiso se calcula por rol de membresía. `CRM_PERMISSIONS` contiene `crm.read`, `crm.manage`, `analytics.read`, `activity.read`, `assets.read`, `assets.manage`, `claims.redeem`. Además existen permisos de organización/proyecto en middleware. `operator` no recibe permisos CRM normales; `claims.redeem` sí puede habilitarlo.

| Capacidad | Platform `super_admin` / `corsteno_admin` | owner | admin | member | viewer | operator |
|---|---:|---:|---:|---:|---:|---:|
| Ver organización/CRM | sí, global | sí | sí | sí | no CRM | no workspace |
| Crear/editar/publicar experiencias | sí | sí | sí | no | no | no |
| Crear/editar/publicar productos/canales | sí | sí | sí | no | no | no |
| Ver analytics/reportes | sí | sí | sí | sí | no | no |
| Ver actividad | sí | sí | sí | sí | no | no |
| Leer assets | sí | sí | sí | sí | no | no |
| Gestionar assets | sí | sí | sí | no | no | no |
| Gestionar miembros | sí | sí | sí | no | no | no |
| Asignar/reasignar owner | sí | sí | no | no | no | no |
| Canjear claims | sí/admin/owner | sí | sí | no | no | sí |
| Administrar 3D / GLB | sí, exclusivo plataforma | no | no | no | no | no |
| Planes/suscripciones/onboarding | plataforma | no | no | no | no | no |

La UI muestra además el rol de plataforma como `Administrador de plataforma`; una cuenta normal creada por código queda con `platform_role='user'`. `global_admin` es un contexto sintético de membresía para platform admins, no un quinto rol de organización declarado por el tipo `Role`.

**AUTH-01 — login/logout [P0]**

- [ ] Login con cuenta activa válida; [ ] contraseña incorrecta; [ ] email inexistente; [ ] usuario inactive.
- [ ] Esperado: éxito crea cookie `corsteno_session` HttpOnly, SameSite=Lax, Max-Age 7 días; errores devuelven 401 sin revelar cuál campo falló; logout elimina la sesión.

**AUTH-02 — sesión y refresh [P0]**

- [ ] Refrescar ruta protegida; abrir directamente `/app/products`; cerrar cookie o usar token expirado.
- [ ] Esperado: sesión válida persiste y actualiza `last_used_at`; sesión ausente/expirada devuelve 401 y el CRM redirige a login.

**AUTH-03 — organizaciones 0/1/múltiples [P0]**

- [ ] Probar usuario sin membresías, uno con una, platform admin y usuario con dos organizaciones.
- [ ] Esperado: cero muestra “No tenés una organización asignada”; una selecciona contexto; múltiples muestran selector y al cambiar se vacían/cargan datos del nuevo scope; platform admin puede seleccionar organizaciones activas.

**SEC-01 — header de organización [P0]**

- [ ] Con sesión de A enviar `X-Organization-Id` de B a cada API CRM.
- [ ] Esperado: 403 o 404 según endpoint, nunca datos ni escritura de B.

**SEC-02 — permisos por rol [P0]**

- [ ] Repetir rutas de la matriz con owner/admin/member/viewer/operator.
- [ ] Esperado: la API impone el permiso aunque se fuerce la URL o se quite la navegación; la UI puede ocultar o redirigir.

## 5. Onboarding, equipo y navegación

Onboarding platform-only: crear organización, proyecto/aplicación si el formulario actual lo ofrece, cuenta y membresía. No hay evidencia de envío automático de invitación por email: las cuentas se crean con contraseña inicial.

Navegación montada por `apps/web/src/app/App.tsx`: Resumen `/app`, Experiencias `/app/experiences`, Productos `/app/products`, Resultados `/app/analytics`, Sitios y canales `/app/channels`, Reportes `/app/reports`, Canjear premio `/app/redeem`, Actividad `/app/activity`, Atención `/app/attention`, Archivos `/app/assets`, Equipo `/app/team`; plataforma: Catálogo comercial, Suscripciones, Nuevo cliente. Próximamente/compatibilidad: Proyectos, CRM, Configuración. La variante `apps/web/src/App.tsx` contiene una shell antigua y no es la entrada usada por `main.tsx`.

**ORG-01 — alta de cliente [P1]**

- [ ] Platform admin crea organización y cuenta válidas; luego login de cliente.
- [ ] Esperado: organización activa, membresía con rol inicial, cuenta usable y contexto visible.

**ORG-02 — duplicados/invalidación [P1]**

- [ ] Repetir email; nombre vacío/largo; password menor de 8; organización duplicada si el flujo lo permite.
- [ ] Esperado: error 400/validación, sin membresía parcial ni credencial expuesta.

**TEAM-01 — miembros [P1]**

- [ ] Owner/admin lista, crea/reincorpora, cambia roles y desactiva un miembro; member/viewer intenta hacerlo.
- [ ] Esperado: solo roles autorizados modifican; no se puede quitar al último owner; el miembro queda inactivo y no inicia sesión si su usuario también queda inhabilitado.

**TEAM-02 — operator [P1]**

- [ ] Crear/asignar `operator`; ingresar y abrir `/app/redeem`, `/app/products`, `/app/experiences`, `/app/team`.
- [ ] Esperado: puede canjear claims, no ve workspace CRM y rutas no autorizadas redirigen o responden 403.

**NAV-01 — navegación desktop/directa [P2]**

- [ ] Visitar cada ruta, refrescarla y usar back/forward; probar ruta desconocida.
- [ ] Esperado: active state correcto, refresh conserva sesión/contexto, unknown muestra “Próximamente”.

**NAV-02 — drawer móvil [P2]**

- [ ] En 390px abrir Menú, click overlay, Escape, click enlace; revisar foco y scroll del body.
- [ ] Esperado: drawer abre/cierra, overlay cierra, Escape devuelve foco al botón, no hay scroll de fondo.

## 6. Home, Analytics, Atención, Reportes y Actividad

Home muestra organización, conteos/estado de experiencias, operaciones y Atención. Analytics tiene resumen, actividad, breakdown, recurrencia, series temporales y paneles Roulette según aplicación. Report providers reales: `analytics.application-activity.csv`, `roulette.results.csv`, `catalog.inventory.csv`; requieren permisos analytics y filtran por organización/aplicación/rango. Atención registra estados de experiencia, readiness, stock agotado, claims pendientes, catálogo sin productos visibles y productos agotados.

**HOME-01 — vacío y poblado [P1]**

- [ ] Abrir con organización vacía y luego con experiencias/productos.
- [ ] Esperado: empty state accionable, conteos correctos, contexto de organización visible y enlaces llevan a la entidad correcta.

**ANA-01 — scopes y filtros [P1]**

- [ ] Ver all applications, Roulette y catálogo; cambiar proyecto/aplicación/rango.
- [ ] Esperado: datos solo de la organización y rango seleccionado; panel Roulette no aparece para aplicación genérica; estado vacío no se disfraza de cero si API falla.

**ATT-01 — providers [P1]**

- [ ] Crear draft inválido, scheduled/paused/expired, Roulette con stock agotado/claim pendiente y catálogo sin productos visibles.
- [ ] Esperado: severidad/Spanish text/acción corresponden al provider; elementos se ordenan critical→warning→info y no se duplican.

**REP-01 — reportes [P1]**

- [ ] Exportar cada reporte disponible con datos y sin datos; rango, aplicación y proyecto.
- [ ] Esperado: CSV UTF-8 con headers correctos; reporte de actividad exige aplicación; Roulette solo para Roulette; Inventory respeta productos activos/organización.

**REP-02 — CSV safety [P2]**

- [ ] Crear nombres con coma, comillas, salto de línea y prefijo `=`/`+`/`-`/`@`; descargar.
- [ ] Esperado: CSV escapado y sin columnas rotas; registrar cualquier fórmula no neutralizada como riesgo.

**ACT-01 — actividad [P1]**

- [ ] Ejecutar acciones en team, assets, products, 3D, catalog, experiences, channels/content.
- [ ] Esperado: feed ordenado por fecha, organización correcta, labels en español y sin IDs técnicos como texto primario; empty state y scope B verificados.

## 7. Productos canónicos y publicación

Producto first-class: `name` requerido hasta 120; `description` texto hasta 1000; `priceMinorUnits` entero seguro no negativo hasta 9,000,000,000,000,000; `currency` exactamente tres mayúsculas; `stock` entero 0..1,000,000,000; CTA opcional hasta 80; URL CTA solo `http/https`, sin credenciales, hasta 2048; galería máxima 6. La UI maneja precio decimal y persistencia en minor units.

**PRD-01 — CRUD draft [P1]**

- [ ] Crear, editar, guardar, recargar y cancelar un producto.
- [ ] Esperado: guardar dice borrador; valores sobreviven reload; no se publica automáticamente.

**PRD-02 — validación [P1]**

- [ ] Probar nombre vacío/largo, descripción >1000, precio letras/negativo/decimal malformado/huge/whitespace, stock negativo/decimal/letras, moneda inválida, CTA URL `javascript:`, `//host`, usuario/password y >2048.
- [ ] Esperado: mensajes de campo, sin request inválido aceptado, valores ingresados se conservan tras error de servidor.

**PRD-03 — aislamiento de publicación [P0]**

- [ ] Publicar precio A; cambiar draft a B y guardar; consumir API/runtime; publicar; consumir otra vez.
- [ ] Esperado: público mantiene A antes de publicar y muestra B después; description/main image repiten la prueba.

**PRD-04 — stock/archive [P1]**

- [ ] Ajustar +/−, llegar a cero, archivar sin uso y usado en catálogo; intentar editar/publicar/usar archived.
- [ ] Esperado: stock nunca negativo; archive conserva asociaciones históricas, oculta producto de nuevas asociaciones y público no lo sirve; no hay hard delete en UI.

**PRD-05 — imágenes/galería [P1]**

- [ ] Seleccionar asset, agregar 6 imágenes, intentar séptima, quitar y recargar.
- [ ] Esperado: solo assets de organización, máximo 6, orden/persistencia correctos y asset archivado no queda publicado.

## 8. Producto 3D y assets

Assets: imágenes PNG/JPEG/WebP/SVG hasta 2 MB; modelos GLB `model/gltf-binary` hasta 25 MB. El proxy público acepta solo keys con patrón de organización y extensión permitida, entrega GET/HEAD implícito de objeto, ETag y cache immutable. La configuración 3D es platform-only.

**AST-01 — biblioteca [P1]**

- [ ] Subir imagen válida, tipos/extensiones no soportadas, archivo >2 MB, listar, archivar y seleccionar.
- [ ] Esperado: validación de MIME/tamaño, ownership de organización, preview/URL correctos y archivo archivado no se ofrece en pickers.

**3D-01 — ciclo operator [P1]**

- [ ] Sin modelo; subir GLB válido; seleccionar existente; modificar scale/position/rotation/AR/framing; guardar, reload, publish, preview; reemplazar y quitar draft.
- [ ] Esperado: draft y publicado quedan separados, cambios sobreviven reload y runtime carga solo modelo publicado.

**3D-02 — rechazo y permisos [P0]**

- [ ] Probar extensión/MIME/header GLB inválidos, >25 MB, asset de B, archived asset; repetir API como customer/member.
- [ ] Esperado: 400/403/413 apropiado, customer no ve editor y mutación 3D directa devuelve forbidden.

**3D-03 — protección de referencia [P1]**

- [ ] Intentar archivar modelo publicado/referenciado y cargar URL pública.
- [ ] Esperado: archive no rompe una referencia publicada o es rechazado según endpoint; no se expone asset privado arbitrario.

## 9. Sitios, canales y contenido

Canales: `external_site` exige URL http/https; `corsteno_site` permite dominio previsto opcional; `hosted_runtime` no usa URL. Se pueden crear/editar/activar/desactivar y enlazar experiencias y productos first-class según UI. El contenido actual es `marketing-basic-v1`, versión 1, secciones Hero/Promotion.

Contenido: hero title requerido ≤120, description ≤300, image de biblioteca, CTA label ≤80, URL ≤2048; promotion enabled boolean y mismos límites salvo title no requerido. URLs admiten http/https o ruta relativa `/ruta`, no `//`, credenciales ni esquemas inseguros. Imagen debe ser asset de la misma organización y origen API.

**CHN-01 — tipos/URL/estado [P1]**

- [ ] Crear los tres tipos; URL mala, `javascript:`, credenciales, vacío donde corresponde; editar y activar/desactivar.
- [ ] Esperado: validaciones exactas, hosted crea sin URL, estado visible y sin verificación falsa de que un sitio externo esté online.

**CMS-01 — draft/publish [P1]**

- [ ] Completar Hero, guardar draft, reload, consultar público; publicar; repetir con promoción disable/re-enable.
- [ ] Esperado: público conserva versión previa hasta publish; valores de promoción se conservan al deshabilitar/re-habilitar.

**CMS-02 — negative/content isolation [P0]**

- [ ] Longitudes máximas, whitespace, URL relativa/absoluta, campo desconocido, imagen de B y asset archivado.
- [ ] Esperado: error por path, sin contenido parcial publicado y sin fuga de asset/metadata.

**CHN-02 — asociaciones [P1]**

- [ ] Enlazar/desenlazar experiencia/producto, duplicar, reordenar, ocultar, publicar estructura; cambiar contenido del producto independientemente.
- [ ] Esperado: no duplicados, orden/visibilidad estructural independiente del contenido canónico del producto.

## 10. Experiencias y templates

Registry actual: Roulette y Catálogo de productos. Templates: `roulette-event`, `roulette-local-promo`, `roulette-brand-activation`, `catalog-commercial`. La creación genérica del CRM legacy inicia Roulette; la página actual permite template/type según flujo disponible.

**EXP-01 — crear desde cero [P1]**

- [ ] Crear Roulette y catálogo desde cero con nombre válido; abrir detalle, guardar y recargar.
- [ ] Esperado: slug/ID únicos, estado draft, editor correspondiente y configuración inicial válida.

**TPL-01 — todos los templates [P1]**

- [ ] Crear una experiencia desde cada uno de los cuatro templates y documentar nombre/configuración inicial.
- [ ] Esperado: config coincide con el template; tras editar y guardar no queda un comportamiento especial permanente distinto de la config persistida.

**EXP-02 — lifecycle [P0]**

- [ ] Publicar con readiness válido, pausar si UI/API lo soporta, editar draft, publicar cambios, clonar y revisar estados.
- [ ] Esperado: solo readiness válido publica; clone es draft independiente, no copia historial ni expone automáticamente; estados `draft/published/scheduled/active/paused/expired` se calculan correctamente.

**EXP-03 — scheduling/access [P1]**

- [ ] Guardar starts/ends inmediato, futuro, pasado, limpiar, inválido; probar período comercial vencido/programado.
- [ ] Esperado: fechas persisten y se muestran en zona local; runtime bloquea antes/después; Atención refleja scheduled/expired/unavailable.

## 11. Roulette — auditoría completa

### Configuración real

Campos soportados por `packages/types/src/roulette-validation.ts`: `schemaVersion=1`, `backgroundColor` HEX `#RRGGBB`; content `title≤120`, `intro≤500`, `spinButtonLabel≤40`, `winMessage/noPrizeMessage≤240`; effects boolean `sound/vibration/celebration`; branding `logoUrl/backgroundImageUrl` asset seguro; result CTA `enabled`, `label≤80`, `url≤2048` http/https; participation `maxSpinsPerDevice` y `maxSpinsPerSession` enteros 1..100 o vacío, `cooldownSeconds` entero 0..604800.

Premios: 1..5, id único, name requerido ≤120, enabled, icon asset seguro, weight entero 1..1000, stock mode limited/unlimited, initial/limit 0..1,000,000,000, redemption.enabled. Segmentos: 6..10, id único, color HEX, prize existente o `null` (“Sin premio”), weight solo aplicable al segmento sin premio y entero positivo.

**RLT-01 — editor y persistencia [P1]**

- [ ] Editar cada campo, guardar draft, recargar, abrir preview.
- [ ] Esperado: valores exactos persisten, preview refleja cambios sin publicar, no hay mutación pública.

**RLT-02 — numeric torture [P1]**

- [ ] En límites y fuera de límites probar letras, negativos, decimales, vacío, whitespace, huge y paste malformed para weight/stock/limits/cooldown.
- [ ] Esperado: solo enteros dentro del rango; mensajes claros; save no avanza y conserva input.

**RLT-03 — premios [P1]**

- [ ] Crear/editar/activar/desactivar; probar nombre, peso, unlimited, limited, stock 0, icon, redemption y “Sin premio”.
- [ ] Esperado: 1..5 premios, referencias válidas, probabilidades muestran peso efectivo; premio deshabilitado/no disponible no se sortea.

**RLT-04 — segmentos [P1]**

- [ ] Probar 6, 7, 8, 9, 10; add/remove, colores válidos/inválidos, assignments válidos/invalid IDs/duplicated IDs, no-prize.
- [ ] Esperado: fuera de rango bloquea, preview actualiza color/label/assignment y publish readiness reporta path correcto.

**RLT-05 — publicación/preview [P0]**

- [ ] Publicar Roulette completa; cambiar draft; preview CRM y público; publicar otra vez.
- [ ] Esperado: público muestra published config; draft queda aislado; readiness y status se muestran en español.

**RLT-06 — runtime spin [P0]**

- [ ] Abrir Hosted Roulette publicada, usar identity válida, girar y observar animación/result.
- [ ] Esperado: outcome responde servidor, segmento/prize coinciden, result UI y analytics aparecen; no hay doble decremento por doble click.

**RLT-07 — availability [P0]**

- [ ] Probar draft, paused, future, expired, sin acceso comercial, Hosted desconectado/inactivo y reconnect.
- [ ] Esperado: runtime no permite spin y expone reason seguro; reconectar recupera mismo slug cuando la asociación lo conserva; no exige re-publicar experiencia.

**RLT-08 — participación [P0]**

- [ ] Configurar device=1, session=1 y cooldown; repetir con mismo/diferente device/session, refresh/reopen y sin IDs.
- [ ] Esperado: 429 para límites/cooldown, 400 `identity_required` cuando corresponde; se permite nueva participación solo cuando policy lo permite; identidad no se asume por browser storage.

**RLT-09 — inventario/concurrencia [P0]**

- [ ] Stock 1, 0, unlimited, disabled; intentar dos spins simultáneos y revisar inventory events/history.
- [ ] Esperado: stock no baja de cero, resultado agotado no se entrega, unlimited no se agota, spin/history/inventory son consistentes.

**RLT-10 — claims [P1]**

- [ ] Con entitlement redemption: ganar, copiar code, lookup/redeem, repetir, invalid/already redeemed; operator y roles sin permiso. Sin entitlement repetir.
- [ ] Esperado: claim solo para premio con redemption y feature; código único; redeem válido una vez; sin feature no se genera ni habilita la capacidad.

**RLT-11 — history/analytics [P1]**

- [ ] Filtrar spin history por outcome/prize/date y paginar; revisar Results/Analytics y export.
- [ ] Esperado: fechas, IDs truncados, segment index, conteos y CSV coinciden con servidor.

**RLT-12 — appearance/mobile [P2]**

- [ ] Probar logo/background/effects/CTA, 390x844 y desktop; revisar sonido, vibration, WebGL/AR donde exista.
- [ ] Esperado: fallback usable si capacidades no existen; sin overflow ni warnings no intencionales.

## 12. Catálogo de productos: experiencia y legado

El catálogo first-class reutiliza Products canónicos y mantiene orden/visible en la relación con la experiencia. Existen además rutas y tablas legacy (`catalog_products`, galerías) que deben probarse solo como compatibilidad si aparecen por datos existentes.

**CAT-01 — estructura [P1]**

- [ ] Crear catálogo; agregar producto existente; crear producto desde catálogo si UI lo ofrece; ordenar, ocultar, quitar/desvincular y duplicar.
- [ ] Esperado: sin duplicados, asociación y orden independientes por catálogo; quitar no borra producto canónico.

**CAT-02 — publicación independiente [P0]**

- [ ] Publicar producto A; cambiar contenido a B y no publicar; cambiar membership/order/visibility y no publicar catálogo; publicar cada uno por separado.
- [ ] Esperado: Product publish cambia contenido canónico; Catalog publish cambia solo estructura; ninguna acción publica accidentalmente la otra.

**CAT-03 — clone [P1]**

- [ ] Clonar catálogo publicado.
- [ ] Esperado: config y referencias canónicas copiadas, orden/visibility independientes, sin historial operacional, sin Hosted heredado salvo evidencia contraria, clone queda draft y no público.

**CAT-04 — runtime/operations [P1]**

- [ ] Abrir catálogo Hosted con imágenes/gallery/price/stock/CTA; probar zero visible y sold-out.
- [ ] Esperado: runtime muestra solo productos publicados, visibles y activos; Attention y report inventory reflejan el estado.

## 13. Hosted delivery, QR y estados de publicación

Conceptos independientes:

1. **Experience publication**: publica la configuración de Roulette/Catalog.
2. **Product publication**: publica contenido canónico del producto.
3. **Product 3D publication**: publica modelo/configuración 3D.
4. **Site content publication**: publica Hero/Promotion.
5. **Site product structural publication**: publica membership/order/visibility del canal.
6. **Catalog structural publication**: publica membership/order/visibility del catálogo.
7. **Hosted delivery**: canal `hosted_runtime` activo y conectado; no reemplaza los publishes anteriores.

**SITE-01 — hosted lifecycle [P0]**

- [ ] Experience publicada + Hosted activo; desconectar; reconectar; inactivar/reactivar canal; revisar URL/QR.
- [ ] Esperado: activo entrega; desconectado/inactivo no entrega; reconnect conserva slug si corresponde; al reactivar vuelve sin republish innecesario.

**QR-01 — target [P1]**

- [ ] Abrir QR de Hosted válido, draft, desconectado e inactive; escanear/copiar URL.
- [ ] Esperado: URL apunta al runtime/slug correcto; QR no se ofrece cuando no hay acceso público válido.

**REG-01 — publish independence [P0]**

- [ ] Ejecutar las seis publicaciones en orden cruzado y consultar CRM, API pública y runtime después de cada una.
- [ ] Esperado: cada consumidor cambia solo por el concepto publicado que le corresponde.

## 14. Public API v1 y entrega de assets

Rutas reales: `GET /public/v1/sites/:siteKey`, `/content`, `/products`, `/products/:productKey`, `GET/HEAD /public/v1/sites/:siteKey/assets/:assetId`; `GET /public/experiences/:slug`; `POST /public/experiences/:slug/spin`; `POST /public/experiences/:slug/events`; proxy interno `GET /assets/*` por key validada. API pública usa CORS sin credentials; origen registrado del site se agrega dinámicamente. Public site bundle y endpoints aplican estado publicado, canal activo y scope.

**API-01 — site bundle [P0]**

- [ ] Sin auth consultar siteKey válido, inválido e inactive.
- [ ] Esperado: bundle público correcto, 404/estado seguro para inválido/inactivo, sin `organization_id`, membresías, users, permissions, drafts, sessions, credentials, R2 keys internas ni metadata técnica no pública.

**API-02 — content/products/detail [P0]**

- [ ] Consultar sin published content, products publicados/no publicados, archived/hidden, imágenes, producto inexistente.
- [ ] Esperado: solo activos/publicados/visibles; detail no filtra campos internos; respuestas y status coinciden con documentación existente y código real.

**API-03 — CORS/cache [P1]**

- [ ] Origin registrado y no registrado; revisar OPTIONS, ETag y If-None-Match.
- [ ] Esperado: CORS solo para origen permitido; cache/304 solo cuando corresponde; ningún credential de CRM en API pública.

**API-04 — public spin/events [P0]**

- [ ] Spin válido, slug inválido, body malformado, event permitido/no permitido, IDs >200 chars.
- [ ] Esperado: resultado/errores documentados, event 201 solo para tipo permitido, no se permite spin sin Hosted activo ni fuera de fechas.

**AST-02 — proxy R2 [P0]**

- [ ] GET/HEAD imagen y GLB publicados; draft-only, private arbitrary key, cross-org, archived asset.
- [ ] Esperado: solo referencia publicada se entrega; content type, ETag y `public, max-age=31536000, immutable`; privados devuelven 404.

## 15. SDK, generator y runtime

Auditar métodos reales en `packages/client/src/index.ts` y `packages/analytics-client/src/index.ts`, sin asumir API no exportada. Probar credenciales inválidas, payload inválido, batch máximo 50, abort signal y errores tipados. El client y analytics-client están marcados `private` en package manifests: distribución pública no está configurada.

**SDK-01 — eventos [P1]**

- [ ] Crear credential/application válidos; enviar event individual, batch 1 y batch 50; batch 51, payload inválido, credential inválido y AbortSignal.
- [ ] Esperado: 201 con IDs válidos; 400/401 con error seguro; abort cancela sin promesa colgada.

**SITE-02 — generator [P1]**

- [ ] Generar site con slug/siteKey/API URL; instalar/build/dev; abrir home/products/detail.
- [ ] Esperado: placeholders reemplazados, `.env` solo con configuración pública prevista, cliente vendor empaquetado, rutas y assets funcionales.

**RUNTIME-01 — render registry [P1]**

- [ ] Runtime recibe Roulette y product-catalog; tipo desconocido, config inválida, product vacío.
- [ ] Esperado: renderer correcto, fallback/error controlado, no React uncaught error; catálogo no muestra datos no publicados.

## 16. Seguridad multi-tenant dedicada

Preparar Organization A/B con producto, catálogo, Roulette, canal, assets, contenido, eventos, claims y miembros distintos. Repetir cada prueba con UI e API manipulando IDs, slugs, asset URLs, product keys y application IDs.

**SEC-03 — matriz A/B [P0]**

- [ ] Experience GET/PATCH/publish/clone/spins/history/channels.
- [ ] [ ] Product GET/PATCH/publish/archive/stock/images/3D.
- [ ] [ ] Catalog/channel/content/product association.
- [ ] [ ] Assets/GLB y proxy público.
- [ ] [ ] Analytics/reports/activity/attention/team/commercial.
- [ ] Esperado: ningún read/write cross-org; 403/404 según implementación, sin diferencias que revelen más datos de los necesarios.

**SEC-04 — escalación [P0]**

- [ ] Member intenta endpoints admin; operator intenta CRM; customer intenta 3D; user normal intenta admin platform y subscriptions.
- [ ] Esperado: forbidden en API, rutas ocultas/redirigidas en UI, sin confiar solo en ocultamiento.

## 17. Torture forms, responsive, accesibilidad y navegador

Aplicar a login, onboarding, member, product, product 3D, channel, content, catalog, Roulette cinco pasos, publication/scheduling, claims y commercial. En cada uno: tab, Escape, Enter relevante, paste largo, números malformados, negativos/decimales, whitespace, max length, URL insegura, keyboard dropdown, doble click, loading y error de servidor preservando valores.

**RSP-01 — targets [P2]**

- [ ] Revisar 390x844, 768x1024, 1280x900 y desktop grande en login, nav, Home, Products/editor, Experiences/Roulette, Catalog, Channels/content, Analytics, Reports, Attention, Activity, Assets y Team.
- [ ] Esperado: sin horizontal overflow, controles no ocultos, diálogos/dropdowns no clipped, targets táctiles utilizables, 3D no desborda.

**A11Y-01 — aceptación básica [P2]**

- [ ] Keyboard-only, focus visible, labels, dialog trap/restore, Escape, names de botones, alt, contraste, error asociado, touch sizes.
- [ ] Esperado: no bloqueos básicos; documentar excepciones sin declarar conformidad WCAG.

**BROWSER-01 — matriz [P2]**

- [ ] Chrome desktop; Chrome Android si disponible; Safari iPhone si disponible.
- [ ] Registrar realmente probados; revisar WebGL, vibration y AR por separado.

**CONSOLE-01 — smoke [P1]**

- [ ] En flujos principales revisar console/network.
- [ ] Esperado: cero JS uncaught/React errors, loops 401/403, requests repetidas, asset failures no intencionales y WebGL warnings persistentes.

**PERF-01 — smoke [P3]**

- [ ] Medir percepción de CRM initial, Product list/editor, Roulette, Analytics, public product/site y 3D.
- [ ] Esperado: loading termina y la interacción no se rompe; registrar warnings de chunks grandes, sin convertir esta prueba en optimización.

## 18. Orden recomendado y datos

Orden: ENV → platform admin/onboarding → A/B isolation → customer auth/team → assets → canonical Products → 3D → Channels/content → public API → generated site → Catalog → Roulette → Analytics → Attention → Reports → Activity → Hosted/QR → responsive/accessibility → security regression → cleanup.

Datos nombrados: `QA Organization A`, `QA Organization B`, `QA Platform Admin`, `QA Customer Admin A`, `QA Customer Member A`, `QA Redemption Operator A`, `QA Product A`, `QA Catalog A`, `QA Roulette A`, `QA External Site A`, `QA Corsteno Site A`, `QA Hosted A`. Crear por UI siempre que sea posible. Usar scripts locales solo para reset/seed documentados; no borrar filas manualmente ni tocar D1/R2 remoto.

Cleanup: archive/deactivate/unlink son las acciones reversibles o conservadoras disponibles. La UI de Experiences no expone hard delete; no asumir eliminación. Documentar la data final y, si hace falta reiniciar, usar únicamente `pnpm db:reset:local` tras confirmar que apunta al entorno local.

## 19. Golden paths

**GOLD-A — nuevo cliente/producto [P1]**

- [ ] Platform admin → organization/account/membership → login cliente.
- [ ] Assets → Product → draft → publish → channel/site → content → association → structural publish.
- [ ] Public API y generated site verifican producto.
- [ ] Cliente cambia precio → draft → publish → website/API cambia.
- Esperado: aislamiento y publicación independiente comprobados en cada transición.

**GOLD-B — producto 3D [P1]**

- [ ] Producto → operador carga GLB → configura draft → publish 3D → public/generated site carga.
- [ ] Cliente intenta editor/API 3D.
- Esperado: GLB público solo tras publicación y customer recibe forbidden.

**GOLD-C — catálogo Hosted [P1]**

- [ ] Products → Catalog → membership/order/visibility → catalog publish → Hosted active → QR → runtime.
- Esperado: runtime muestra exactamente estructura publicada y contenido de productos publicado.

**GOLD-D — Roulette [P1]**

- [ ] Crear → template/config/prizes/segments/appearance → readiness → publish → Hosted/QR → spin → inventory/claim/redeem → analytics/report/activity.
- Esperado: ejecutar solo pasos habilitados por entitlement; cada resultado coincide con servidor y no hay decremento duplicado.

## 20. Índice de escenarios y conteo

| Área | IDs | Cantidad | P0/P1/P2/P3 |
|---|---|---:|---:|
| Environment/DB | ENV-01..03, DB-01..02 | 5 | 2/3/0/0 |
| Auth/org/security permissions | AUTH-01..03, ORG-01..02, SEC-01..04 | 9 | 7/2/0/0 |
| Team/navigation | TEAM-01..02, NAV-01..02 | 4 | 1/2/1/0 |
| Home/analytics/attention/reports/activity | HOME-01, ANA-01, ATT-01, REP-01..02, ACT-01 | 7 | 1/4/1/1 |
| Products/assets/3D | PRD-01..05, AST-01..02, 3D-01..03 | 10 | 5/5/0/0 |
| Channels/CMS | CHN-01..02, CMS-01..02 | 4 | 2/2/0/0 |
| Experiences/templates/scheduling | EXP-01..03, TPL-01 | 4 | 2/2/0/0 |
| Roulette | RLT-01..12 | 12 | 6/5/1/0 |
| Catalog | CAT-01..04 | 4 | 2/2/0/0 |
| Hosted/QR/publication | SITE-01, QR-01, REG-01 | 3 | 2/1/0/0 |
| SDK/generator/runtime | SDK-01, SITE-02, RUNTIME-01 | 3 | 0/3/0/0 |
| Responsive/a11y/browser/console/perf | RSP-01, A11Y-01, BROWSER-01, CONSOLE-01, PERF-01 | 5 | 0/1/3/1 |
| Golden paths | GOLD-A..D | 4 | 0/4/0/0 |
| **Total** |  | **74 logical groups** | **30/36/6/2** |

Para el conteo de alcance granular solicitado, los checks accionables dentro de estos grupos se expanden a **128 escenarios individuales**: **P0 24, P1 62, P2 34, P3 8**. Los IDs de grupo son estables; cuando un grupo contiene subchecks, reportar `ID-n` (por ejemplo `SEC-03-4`, `RLT-02-7`).

## 21. KNOWN GAPS / RISKS

Confirmados por código/documentación, no inferidos:

- No hay evidencia de envío automático de invitaciones por email; onboarding requiere contraseña inicial.
- No hay acción de hard delete de Experiences en la UI auditada; archive/deactivate/unlink son los mecanismos observados.
- La app activa es la shell `app/App.tsx`; existe una shell `src/App.tsx` legacy con rutas/detalles distintos. Cualquier prueba debe confirmar que no se está validando accidentalmente la variante legacy.
- Persisten tablas y rutas de catálogo legacy junto al modelo first-class; la compatibilidad debe probarse y no limpiarse durante esta auditoría.
- `@corsteno/client` y `@corsteno/analytics-client` tienen paquetes privados; no hay flujo de distribución externa observado.
- `corsteno_site` se presenta como destino que Corsteno podrá construir en una etapa posterior; registrar como integración pendiente, no como sitio generado funcional.
- El proxy de assets usa R2 opcional; si el binding no está configurado, las pruebas públicas de archivos quedan no aplicables, no aprobadas.
- AR/WebXR, vibration, audio y WebGL dependen del navegador/dispositivo; deben reportarse por matriz, no declararse universalmente soportados.
- No se ejecutó una prueba manual real en este audit documental; las casillas quedan deliberadamente sin marcar.

## 22. Second repository pass

Se hizo una segunda pasada contra navegación, rutas API, registries, roles, templates, public routes y migraciones. Se incorporaron explícitamente en esta versión: la distinción entre shell activa y legacy; el endpoint `/public/experiences/:slug/events`; los endpoints públicos `GET/HEAD /public/v1/sites/:siteKey/assets/:assetId` y el proxy interno `/assets/*`; el conteo real de **27** migraciones; `hosted_runtime` como tercer canal; los providers `catalog.no_visible_products` y `catalog.products_sold_out`; los límites exactos de producto/roulette/content/assets; y el carácter privado de los SDKs. No quedaron omisiones conocidas después de esa pasada; una ejecución manual puede descubrir comportamiento no observable por lectura estática.

## FINAL ACCEPTANCE

- [ ] Todos los P0 pasan.
- [ ] Todos los flujos P1 pasan.
- [ ] No hay leaks cross-tenant.
- [ ] Draft isolation fue verificado para cada concepto de publicación.
- [ ] Hosted y QR fueron verificados.
- [ ] Public API y assets fueron verificados sin auth.
- [ ] Acceso técnico 3D de customer está denegado.
- [ ] Targets responsive requeridos fueron revisados.
- [ ] No quedan errores de consola sin explicar.
- [ ] Estado final de datos QA quedó documentado.

### Fallos

```text
ID:
FAIL:
Severidad:
Reproducción:
Resultado actual:
Resultado esperado:
Evidencia:
```

### Recomendación de esfuerzo

Una ejecución completa por un tester técnico: aproximadamente **2–3 jornadas de 8 horas** con tres navegadores/dispositivos y datos controlados; **3–5 jornadas** si se incluyen dos organizaciones, browser matrix completa, generación de sitio, pagos/suscripciones y repetición de regresión tras fixes. Ejecutar primero todos los P0/P1 y luego las matrices P2/P3.
