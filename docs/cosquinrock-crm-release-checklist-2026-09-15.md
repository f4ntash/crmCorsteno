# Cosquín Rock CRM — checklist de release (2026-09-15)

Alcance: CRM/API del workspace Cosquín Rock. No se modificó el repositorio de la experiencia AR. Los checks corresponden a la auditoría de producción y al estado local indicado; los pendientes quedan sin marcar.

## Checklist

- [x] **Auth:** login real y segundo login de `cosquinrock@corsteno.com` correctos; login inválido devuelve error genérico. La sesión CRM del navegador se cerró al terminar.
- [x] **Usuario:** `/auth/me` devolvió `platformRole=user`; membership activa `owner` en Cosquín Rock, con permisos CRM de lectura/gestión. No es `super_admin`.
- [ ] **Sesiones:** el inventario D1 no pudo leerse con Wrangler (Cloudflare rechazó la cuenta). La auditoría creó sesiones temporales por navegador/API; no se pudo enumerar ni revocar las sesiones API CLI sin su token. Expiran en 7 días.
- [x] **Workspace:** sólo se observó Cosquín Rock y una experiencia asignada, `Cosquín Rock AR`.
- [x] **Navigation:** Inicio, Experiencia AR y Analytics; Activity y administración no aparecen.
- [x] **AR:** registro `type=ar`, título Cosquín Rock AR, publicado/activo y acceso sin restricciones; no se muestra editor Web/Ruleta ni campos técnicos.
- [x] **URL / aislamiento:** se encontró un único canal externo activo con `https://cosquinrock.corsteno.com/`, pero inicialmente estaba sin asociar. Se enlazó a la experiencia con el endpoint oficial; la API confirmó el vínculo.
- [x] **URL clicable desde CRM:** desplegado link seguro (`target=_blank`, `rel=noreferrer`) a la URL canónica; el DOM productivo confirma el `href`. La automatización in-app no expuso una nueva pestaña al simular el click.
- [x] **Analytics:** resumen, gráficos y top eventos de Cosquín cargan; filtros incluyen sólo el proyecto y aplicación Cosquín. Los eventos seed no exponen `canonical_seed` ni propiedades internas.
- [ ] **Event ingestion en vivo:** se hizo un click de inicio en la app pública; la cámara expiró con `MindAR start timeout`. Analytics a 24 h mostró cero eventos, así que no se confirmó ingestión.
- [x] **Deep links / permisos:** el menú y las rutas protegidas de CRM no ofrecen módulos internos a este usuario; se revisaron redirecciones de rutas restringidas.
- [ ] **Admin workspace:** no se probó porque la sesión admin/password de `admin@corsteno.com` no está disponible en el entorno.
- [ ] **Mobile:** Inicio/nav a 375 px; Analytics a 390 y 768 px; detalle AR a 375/390/768 px. En 768 px los valores de dos selectores se recortan. Falta login responsive y medición precisa de overflow.
- [x] **F5:** Inicio, listado de experiencias, Analytics y detalle AR cargan directamente y sobreviven refresh en producción.
- [x] **Console CRM:** cero errores/warnings capturados durante navegación cliente.
- [ ] **Console / Network pública:** la app AR registró error de startup; no se obtuvo un panel de requests del navegador para enumerar fallos individuales.
- [x] **CORS:** preflight devuelve 204 y permite `https://crm.corsteno.com` con credenciales; también permite `https://cosquinrock.corsteno.com`.
- [x] **URL pública:** `crm`, `api` y la app Cosquín responden HTTP 200; API health 200. El enlace del canal contiene el host canónico.
- [x] **Tests:** API 375, Runtime 23, Client 3, Analytics Client 3 y Site Generator 4; todo pasó. Pasaron regresiones de canales/seed, build, typecheck y lint web. El build conserva warnings de chunk grande/imports.
- [ ] **Security / datos canónicos:** API limita canales/experiencias/analytics por organización; no se pudo verificar duplicados/sesiones ni metadata de todos los eventos mediante lectura D1.

## Hallazgos y acciones

- La relación del canal público faltaba en el dataset real. Se creó sólo el vínculo `experience_channels` Cosquín ↔ Cosquín Rock AR; la URL y el canal preexistentes no se cambiaron.
- El CRM mostraba la URL externa como texto. Se corrigió localmente para que una URL activa sea clicable y abra en pestaña nueva.
- El generador canónico omitía esa relación; se corrigió localmente y se agregó una regresión enfocada.
- El mapa externo declara 19 eventos; Analytics agrega ocho como KPIs WebAR y presenta el resto en eventos totales/Top eventos. Top eventos usa etiquetas en inglés por conversión automática; no se amplió el dashboard.
- El smoke de la app pública se quedó esperando la cámara y mostró `ERROR DE DESARROLLO` / `MindAR start timeout`. Resolverlo requiere intervención en el repositorio AR, expresamente fuera de alcance.
- Wrangler lista versiones del Worker, pero D1 remoto devuelve `The given account is not valid or is not authorized` (código 7403). La auditoría no usó SQL remoto para inspeccionar cuentas, eventos o sesiones.
- El CRM frontend se desplegó como versión `57679e72-0228-46c3-a420-7528acf6bbed`; no hizo falta desplegar cambios de API.

## PREGUNTAS PARA MATÍAS ANTES DE ENVIAR

- ¿El copy visible `Cosquín Rock AR` / `Experiencia conceptual de realidad aumentada` y el branding `CORSTENO LABS` están aprobados para el envío?
- ¿Se puede reproducir el timeout de cámara en un teléfono real con permiso de cámara? El smoke desde este navegador no confirmó evento en vivo y dejó la experiencia en error.
- ¿Quién hará la prueba final de Admin → workspace Cosquín y confirmará el modo de retorno a Administración?
- ¿Las sesiones temporales usadas por esta auditoría deben dejarse expirar (7 días) o Matías puede revocarlas desde administración? No se expusieron tokens.
- ¿Quién recibirá hoy el enlace público y se espera que use login del CRM? La cuenta existe y autentica; la experiencia pública se abre sin login.

## FALTANTES DETECTADOS

### BLOCKER HOY

- No está verificado el flujo real de cámara/event ingestion de la app pública; el navegador registró timeout de MindAR y el evento no apareció en Analytics a 24 h. La experiencia AR necesita confirmación en dispositivo real antes del envío.


### IMPORTANTE POST-ENVÍO

- Reconciliar el inventario de sesiones con acceso Cloudflare D1 válido y retirar las sesiones de QA/API que sigan activas.
- Completar prueba admin workspace y responsive de login a 375/390/768 px; en esta pasada se cubrieron Inicio, Analytics y detalle en distintos anchos, aunque el popup de nueva pestaña no quedó visible en el navegador in-app.
- Verificar Network en DevTools con una sesión de navegador capaz de capturar requests y descartar fallos intermitentes observados como spinners largos.

### MEJORA FUTURA

- Traducir a copy AR los eventos que hoy aparecen en Top eventos con conversión automática de snake_case a inglés title-case.
- Evaluar si KPIs de eventos AR adicionales (por ejemplo `favorite_removed`, `go_to_show_clicked`, `direction_viewed`, `my_schedule_viewed`, `ar_target_lost`, `offline_mode_used`) merecen métricas dedicadas; no se amplió el dashboard.
- Ajustar el ancho/truncamiento de los selectores de filtros a 768 px.
- Revisar el chunk principal del CRM (1.52 MB sin comprimir) y el warning de imports estáticos/dinámicos; no se refactorizó en este release.

## Decisión

**NO-GO — CRM NOT READY.** El dato del canal y el enlace clicable del CRM ya están reparados y desplegados. Sigue bloqueando el envío la integración pública AR: el smoke terminó en timeout de MindAR y no confirmó ningún evento en vivo; validar en un dispositivo real antes de entregar.
