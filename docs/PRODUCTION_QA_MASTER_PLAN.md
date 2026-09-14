# Corsteno CRM & Sales Engine
# Production QA Master Plan

Versión: 1.0  
Fecha de auditoría: 2026-09-14  
Entorno objetivo: `https://crm.corsteno.com`  
API: `https://api.corsteno.com`  
Base productiva: `corsteno-db`  

Este documento es un manual de testing manual. No reemplaza los tests automatizados y no autoriza cambios de código, despliegues, migraciones, creación masiva de datos ni limpieza destructiva.

## Reglas de seguridad

- No copiar, mostrar ni registrar contraseñas, cookies, tokens, hashes, secrets ni headers `Authorization`.
- No ejecutar SQL `INSERT`, `UPDATE`, `DELETE`, `DROP`, migraciones ni comandos de Queue durante estas pruebas.
- No usar `CF_QUEUES_API_TOKEN` ni `FINDER_SERVICE_SECRET` como evidencia. Verificar únicamente presencia o nombres.
- Usar la organización activa esperada y fixtures aislados para pruebas multi-tenant o de roles.
- Antes de crear Leads productivos, registrar el estado inicial de la base y del área Leads.
- Si una prueba modifica un Lead, registrar el `Lead ID` y restaurar sólo ese dato mediante el flujo autorizado, nunca con SQL manual.
- Detenerse ante cualquier regla STOP de este documento.

## Estado conocido al iniciar

El reset de datos productivos dejó la base con un admin, una organización y una membership activa. Las tablas de negocio están vacías. La última migración registrada es `0029_finder_lead_dedupe.sql`. El Finder productivo usa `external_persist`, batches de 5 y safety cap de `3 × objetivo`; la primera prueba recomendada es de 5 Leads.

## Matriz de resultados

Completar durante la ejecución. `Total` es el número de pruebas del catálogo: 91.

| Fase | Total | PASS | FAIL | BLOCKED | Pendiente |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0. Precheck | 8 |  |  |  |  |
| 1. Auth | 10 |  |  |  |  |
| 2. Organización | 4 |  |  |  |  |
| 3. Permisos | 6 |  |  |  |  |
| 4. CRM general | 6 |  |  |  |  |
| 5. Leads UI | 8 |  |  |  |  |
| 6. Buscar Leads | 8 |  |  |  |  |
| 7. Finder 5 | 4 |  |  |  |  |
| 8. Dedupe | 4 |  |  |  |  |
| 9. Finder 10 | 2 |  |  |  |  |
| 10. Finder 25 | 2 |  |  |  |  |
| 11. Partial | 2 |  |  |  |  |
| 12. Cancelación | 4 |  |  |  |  |
| 13. Refresh/browser | 2 |  |  |  |  |
| 14. Runner | 4 |  |  |  |  |
| 15. Playwright/Finder | 3 |  |  |  |  |
| 16. Blocked | 1 |  |  |  |  |
| 17. Network errors | 2 |  |  |  |  |
| 18. Idempotencia | 2 |  |  |  |  |
| 19. Calidad de datos | 1 |  |  |  |  |
| 20. Métricas | 1 |  |  |  |  |
| 21. D1 | 1 |  |  |  |  |
| 22. Queues | 1 |  |  |  |  |
| 23. Seguridad | 1 |  |  |  |  |
| 24. Performance | 1 |  |  |  |  |
| 25. UX | 1 |  |  |  |  |
| 26. Regresión | 1 |  |  |  |  |
| 27. Cleanup documental | 1 |  |  |  |  |
| **Total** | **91** |  |  |  |  |

En cada ficha, marcar PASS o FAIL y completar evidencia y notas.

---

# Fase 0 — Precheck de producción

## PRE-001 — Frontend, API y Worker canónico

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- Acceso a una terminal con Wrangler autenticado, sin mostrar tokens.
- No tener una sesión de prueba que pueda crear datos.

### Pasos

1. Abrir `https://crm.corsteno.com`.
2. En una terminal ejecutar:

   ```powershell
   Invoke-WebRequest https://crm.corsteno.com -UseBasicParsing | Select-Object StatusCode
   Invoke-WebRequest https://api.corsteno.com/health -UseBasicParsing | Select-Object StatusCode,Content
   ```

3. Confirmar en el health que `service` sea `corsteno-api`, `environment` sea `production` y exista `version`.
4. Confirmar que el dominio productivo responde desde `corsteno-crm`, no desde `crmcorsteno`, mediante la configuración de Workers o el panel Cloudflare.

### Resultado esperado

- Frontend HTTP 200.
- API `/health` HTTP 200.
- Worker canónico: `corsteno-crm`.
- API canónica: `corsteno-api`.

### Qué observar

- No debe aparecer `localhost:8787` en una request productiva.
- No exponer el contenido de cookies ni headers sensibles.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-002 — Versiones desplegadas

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- PRE-001 PASS.

### Pasos

1. Ejecutar `wrangler deployments list` para `corsteno-api` y `corsteno-crm`, sin copiar tokens.
2. Comparar los IDs con la orden de release aprobada.
3. Registrar sólo Worker, versión, fecha y estado.

### Resultado esperado

- Ambos Workers tienen una versión desplegada y activa.
- No se modifica ningún Worker.

### Qué observar

- No confundir `crmcorsteno` con el frontend canónico.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-003 — D1, migraciones y base limpia

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- Tener autorización de sólo lectura sobre D1.

### Pasos

1. Ejecutar desde `apps/api`:

   ```powershell
   pnpm exec wrangler d1 info corsteno-db
   pnpm exec wrangler d1 execute corsteno-db --remote --command "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS organizations FROM organizations; SELECT COUNT(*) AS memberships FROM memberships; SELECT COUNT(*) AS leads FROM leads; SELECT COUNT(*) AS lead_jobs FROM lead_jobs; SELECT COUNT(*) AS sessions FROM auth_sessions; SELECT COUNT(*) AS migrations FROM d1_migrations;"
   ```

2. Confirmar database name `corsteno-db`, database ID esperado y última migration `0029_finder_lead_dedupe.sql` mediante una consulta de lectura.

### Resultado esperado

- Users: 1.
- Organizations: 1.
- Memberships: 1.
- Leads: 0.
- Lead jobs: 0.
- Auth sessions: 0 antes del login.
- Migrations: 30, última `0029_finder_lead_dedupe.sql`.

### Qué observar

- El comando debe usar `--remote`.
- Nunca ejecutar una query de escritura durante esta fase.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-004 — Queues y consumer

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- PRE-001 PASS.

### Pasos

1. Ejecutar `wrangler queues list`.
2. Ubicar `corsteno-finder-jobs`, `corsteno-lead-jobs` y, si corresponde, su DLQ.
3. Registrar IDs, producers, consumers y backlog sin modificar configuración.

### Resultado esperado

- Finder Queue existe con Producer remoto y HTTP Pull Consumer.
- Lead Queue existe con su consumer configurado.
- No se publica ningún mensaje.

### Qué observar

- Finder Queue vacía antes de crear el primer Job.
- No alterar retries, visibility timeout ni DLQ.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-005 — Secrets por nombre

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- Acceso autenticado a Wrangler.

### Pasos

1. Ejecutar `wrangler secret list` sobre `corsteno-api`.
2. Confirmar sólo los nombres esperados.
3. No ejecutar `secret get`, no imprimir valores y no guardar la salida completa si contiene información sensible.

### Resultado esperado

- Está presente `FINDER_SERVICE_SECRET`.
- No aparece ningún secret en frontend, Git o archivos de documentación.

### Qué observar

- La evidencia debe mostrar nombres o una captura censurada, nunca valores.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-006 — API URL productiva

Prioridad: P0 BLOCKER  
Bloqueante: Sí

### Precondiciones

- DevTools disponible.

### Pasos

1. Abrir el CRM y DevTools → Network.
2. Recargar `/app`.
3. Revisar las requests a `/auth/me` y a los módulos cargados.
4. Buscar `localhost:8787` en el código fuente cargado o en la lista de requests.

### Resultado esperado

- Las requests productivas usan `https://api.corsteno.com`.
- No hay requests productivas a `localhost`.

### Qué observar

- No copiar cookies ni tokens de la pestaña Network.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-007 — Integridad de código y configuración

Prioridad: P1 CRITICAL  
Bloqueante: Sí

### Precondiciones

- Checkout que se va a probar identificado.

### Pasos

1. Revisar `apps/api/wrangler.toml` y `apps/web/wrangler.toml`.
2. Confirmar nombres `corsteno-api` y `corsteno-crm`.
3. Confirmar que no haya cambios locales no aprobados en funcionalidad productiva.
4. Confirmar que `services/finder/.env.local` está ignorado por Git.

### Resultado esperado

- No hay secretos trackeados.
- No hay deploy automático de `crmcorsteno` usado para validar producción.

### Qué observar

- No ejecutar `git add`, `git commit` ni `git push` como parte del QA.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PRE-008 — Estado inicial visual

Prioridad: P1 CRITICAL  
Bloqueante: Sí

### Precondiciones

- PRE-003 PASS.

### Pasos

1. Iniciar sesión con el admin autorizado.
2. Abrir `Leads`.
3. Registrar KPIs, empty state y lista de Procesos.

### Resultado esperado

- Leads totales: 0.
- No hay Jobs anteriores visibles.
- Se muestra el botón `Buscar Leads` para `crm.manage`.

### Qué observar

- No crear un Job durante este precheck.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 1 — Auth

Cuenta de referencia: `admin@corsteno.com`. La contraseña se introduce directamente en el navegador y nunca se escribe en este documento.

## AUTH-001 — Login válido

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Sesiones productivas en 0 o estado inicial registrado.
- Contraseña disponible para el tester, fuera de logs y chat.

### Pasos

1. Abrir `https://crm.corsteno.com/login`.
2. Introducir el email del admin.
3. Introducir la contraseña directamente en el campo.
4. Pulsar `Ingresar`.

### Resultado esperado

- HTTP 200 en `POST https://api.corsteno.com/auth/login`.
- Redirección a `/app`.
- Se muestra la organización `Corsteno`.
- No se muestra la contraseña ni el token.

### Qué observar

- Cookie de sesión presente como HttpOnly/Secure/SameSite=Lax, sin copiar su valor.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network: método, URL y status sin headers sensibles.
- Logs:
- Notas:

## AUTH-002 — Password incorrecta

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Cerrar sesión.

### Pasos

1. Usar el email válido.
2. Introducir una contraseña incorrecta de prueba.
3. Pulsar `Ingresar`.

### Resultado esperado

- HTTP 401.
- Mensaje genérico de credenciales inválidas.
- No se crea sesión.
- No se revela si el email existe por separado.

### Qué observar

- No guardar la contraseña incorrecta en capturas.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-003 — Email inexistente

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Usar un email sintético que no sea de un usuario real.

### Pasos

1. Introducir un email ficticio.
2. Introducir una contraseña ficticia.
3. Pulsar `Ingresar`.

### Resultado esperado

- HTTP 401.
- Respuesta indistinguible de AUTH-002.
- No se crea sesión.

### Qué observar

- No probar con emails de terceros reales.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-004 — Campos vacíos y validación

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Pantalla de login limpia.

### Pasos

1. Pulsar `Ingresar` con ambos campos vacíos.
2. Probar email vacío con password cargada.
3. Probar password vacía con email cargado.
4. Probar espacios alrededor del email.

### Resultado esperado

- El navegador o API rechaza el formulario.
- No se crea sesión.
- El email válido con espacios se normaliza si la UI lo permite.

### Qué observar

- No debe producir error 500.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-005 — Logout

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- AUTH-001 PASS.

### Pasos

1. Pulsar `Salir`.
2. Intentar volver a `/app`.
3. Revisar que el navegador redirija a `/login`.

### Resultado esperado

- `POST /auth/logout` responde correctamente.
- La sesión queda invalidada.
- `/app` requiere login nuevamente.

### Qué observar

- No copiar el valor de la cookie.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-006 — Refresh y cierre/reapertura

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- AUTH-001 PASS.

### Pasos

1. Recargar `/app`.
2. Cerrar la pestaña.
3. Reabrir `https://crm.corsteno.com/app` en la misma sesión del navegador.
4. Verificar el workspace.

### Resultado esperado

- `/auth/me` restaura el usuario activo.
- El admin vuelve al workspace sin login adicional mientras la sesión siga vigente.

### Qué observar

- No debe aparecer una organización incorrecta.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-007 — Endpoint protegido sin sesión

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Usar ventana privada o un cliente sin cookies.

### Pasos

1. Solicitar `GET https://api.corsteno.com/auth/me` sin enviar cookies.
2. Solicitar `GET https://api.corsteno.com/leads` sin sesión.

### Resultado esperado

- Ambos responden HTTP 401.
- No se devuelve información de la organización ni Leads.

### Qué observar

- No usar cookies copiadas de otro navegador.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-008 — Ruta protegida y múltiples tabs

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Sesión válida.

### Pasos

1. Abrir `/app/leads` en dos pestañas.
2. Confirmar que ambas muestran el mismo workspace.
3. Cerrar sesión desde una pestaña.
4. Recargar la otra.

### Resultado esperado

- Ambas pestañas reflejan la sesión invalidada al volver a consultar la API.
- La pestaña recargada vuelve a `/login`.

### Qué observar

- No debe quedar acceso a datos luego de un refresh posterior al logout.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-009 — Expiración de sesión

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- No esperar siete días en producción.
- Usar fixture/mock o una sesión controlada en un entorno no productivo.

### Pasos

1. En fixture, usar una sesión expirada.
2. Solicitar `/auth/me` y luego `/app`.

### Resultado esperado

- HTTP 401.
- La aplicación redirige al login.

### Qué observar

- Marcar BLOCKED si sólo puede hacerse alterando D1 productiva.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## AUTH-010 — Seguridad de cookie

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- AUTH-001 PASS.

### Pasos

1. Abrir DevTools → Application/Storage → Cookies.
2. Revisar sólo atributos, sin copiar el valor.

### Resultado esperado

- `HttpOnly`: activado.
- `Secure`: activado en producción.
- `SameSite`: `Lax`.
- `Path`: `/`.

### Qué observar

- Si el valor aparece en una captura, descartar la captura.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network:
- Logs:
- Notas:

---

# Fase 2 — Organización y multi-tenant

Las pruebas de tenant alternativo requieren fixtures seguros. No crear organizaciones en producción durante este plan.

## ORG-001 — Organización activa

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- AUTH-001 PASS.

### Pasos

1. Revisar el selector o nombre de organización del header.
2. Abrir Leads, Equipo y Actividad.
3. Confirmar que la organización mostrada sea `Corsteno`.

### Resultado esperado

- El contexto activo es consistente en UI y requests.
- Las requests que requieren contexto incluyen `X-Organization-Id` sin que el usuario lo escriba.

### Qué observar

- No mostrar el ID completo si la evidencia no lo necesita.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## ORG-002 — Aislamiento entre organizaciones

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixture automatizado o staging con dos organizaciones y usuarios autorizados.

### Pasos

1. Crear datos ficticios en cada tenant sólo dentro del fixture.
2. Iniciar sesión como usuario del tenant A.
3. Solicitar Leads, Jobs, Actividad y Equipo.
4. Repetir como usuario del tenant B.

### Resultado esperado

- Cada usuario ve exclusivamente sus datos.
- IDs de otro tenant no permiten lectura, mutación ni cancelación.

### Qué observar

- No ejecutar con datos reales de terceros.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## ORG-003 — Organization ID manipulado

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixture con organización A y B.

### Pasos

1. En un cliente de prueba, cambiar `X-Organization-Id` por el ID de B.
2. Solicitar `GET /leads`, `GET /leads/jobs/list` y `POST /leads/jobs`.

### Resultado esperado

- El servidor responde 403 o equivalente seguro.
- No devuelve ni muta datos de B.

### Qué observar

- El frontend no es la barrera de seguridad; la API debe rechazarlo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## ORG-004 — Usuario sin membership

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture de usuario activo sin membership.

### Pasos

1. Iniciar sesión con el usuario fixture.
2. Abrir `/app`.
3. Intentar consultar `/leads` con el ID de Corsteno.

### Resultado esperado

- UI informa que no hay organización asignada o redirige.
- API rechaza el contexto.

### Qué observar

- No modificar memberships productivas para probarlo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 3 — Permisos

Roles implementados: `owner`, `admin`, `member`, `viewer`, `operator`. El admin de plataforma (`super_admin`/`corsteno_admin`) recibe permisos globales. `crm.read` requiere como mínimo `member`; `crm.manage` requiere como mínimo `admin`; `operator` no recibe permisos CRM normales.

## PERM-001 — Matriz de roles

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixtures de owner, admin, member, viewer y operator.

### Pasos

1. Consultar `/auth/me` para cada fixture.
2. Registrar únicamente nombres de permisos, nunca tokens.
3. Comparar con esta matriz:

| Rol | crm.read | crm.manage | activity.read | assets.read | claims.redeem |
| --- | --- | --- | --- | --- | --- |
| owner | Sí | Sí | Sí | Sí | Sí |
| admin | Sí | Sí | Sí | Sí | Sí |
| member | Sí | No | Sí | Sí | No |
| viewer | Sí | No | No | No | No |
| operator | No | No | No | No | Sí |

### Resultado esperado

- La respuesta y las pantallas respetan la matriz.

### Qué observar

- Un botón oculto nunca sustituye la autorización del backend.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PERM-002 — Lectura de Leads

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixtures PERM-001.

### Pasos

1. Abrir `/app/leads` con owner, admin, member y viewer.
2. Repetir request `GET /leads`.

### Resultado esperado

- Roles con `crm.read` ven Leads.
- Operator sin `crm.read` no ve el módulo y la API rechaza la lectura.

### Qué observar

- El acceso se debe evaluar también con ruta directa.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PERM-003 — Crear búsqueda

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Base de prueba o fixture que pueda recibir un Job controlado.

### Pasos

1. Con owner/admin, abrir `Buscar Leads` y observar el botón.
2. Con member/viewer, abrir Leads.
3. Intentar `POST /leads/jobs` desde el cliente de prueba con `crm.manage` ausente.

### Resultado esperado

- Sólo owner/admin ve y puede ejecutar `Buscar Leads`.
- Member/viewer no ve la acción y API responde 403.

### Qué observar

- No crear Jobs en producción durante la prueba de roles.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PERM-004 — Cancelar Job

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Job fixture `QUEUED` o `RUNNING`.

### Pasos

1. Probar el botón `Cancelar` con owner/admin.
2. Intentar el mismo endpoint con member/viewer.

### Resultado esperado

- Owner/admin puede cancelar su Job autorizado.
- API rechaza member/viewer con 403.

### Qué observar

- No cancelar un Job de otro tenant.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PERM-005 — Mutación de Lead

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Lead fixture.

### Pasos

1. Abrir el detalle del Lead.
2. Con member/viewer observar el selector de estado.
3. Con owner/admin modificar el estado permitido y guardar.

### Resultado esperado

- Member/viewer ve el dato pero no puede modificarlo.
- Owner/admin puede actualizar estado.

### Qué observar

- Confirmar que el backend también rechaza una mutación no autorizada.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PERM-006 — Ruta directa y API sin permiso

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixture sin `crm.read` y fixture sin `crm.manage`.

### Pasos

1. Navegar directamente a `/app/leads`.
2. Intentar crear Job por API.
3. Intentar cancelar Job por API.

### Resultado esperado

- La ruta redirige o muestra acceso denegado.
- Las mutaciones responden 403.

### Qué observar

- No confiar sólo en botones ocultos.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 4 — CRM general y navegación

Módulos reales auditados: Resumen, Experiencias, Productos, Leads, Resultados, Sitios y canales, Reportes, Canjear premio, Actividad, Atención, Archivos, Equipo, Catálogo comercial, Suscripciones y onboarding para operador de plataforma. `Proyectos`, `CRM` y `Configuración` aparecen bajo “Próximamente” y muestran placeholder; no se deben probar como funcionalidades terminadas.

## CRM-001 — Navegación principal

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- AUTH-001 PASS.

### Pasos

1. Recorrer los enlaces visibles del sidebar según el rol.
2. Confirmar que el enlace activo se marque.
3. Volver a Resumen desde cada página.

### Resultado esperado

- Cada módulo implementado abre sin error 500.
- Los enlaces de módulos no autorizados no aparecen.

### Qué observar

- `Proyectos`, `CRM` y `Configuración` deben identificarse como próximos, no como bug si muestran placeholder.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CRM-002 — Refresh y deep links

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Sesión válida.

### Pasos

1. Abrir directamente `/app/leads`, `/app/products`, `/app/experiences`, `/app/channels`, `/app/reports` y `/app/team`.
2. Recargar cada URL.

### Resultado esperado

- La aplicación restaura la sesión y la página correcta.
- No aparece una pantalla en blanco.

### Qué observar

- Registrar cualquier redirección inesperada al dashboard.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CRM-003 — Loading, empty y error states

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- Base limpia.

### Pasos

1. Abrir cada página con datos vacíos.
2. Observar loading inicial.
3. En fixture o DevTools local, simular un 500 y revisar el estado de error.

### Resultado esperado

- Cada módulo muestra estado vacío comprensible.
- Los errores ofrecen reintento cuando corresponde.
- No se muestran stack traces ni secrets.

### Qué observar

- No provocar 500 productivos deliberadamente.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CRM-004 — Responsive desktop/tablet/mobile

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Navegador con emulación 1440px, 1024px y 390px.

### Pasos

1. Recorrer sidebar, header y página actual en cada viewport.
2. Abrir el menú móvil y cerrarlo con backdrop y Escape.
3. Confirmar que tablas y drawers no desborden horizontalmente.

### Resultado esperado

- Navegación usable en desktop, tablet y mobile.
- El foco vuelve al botón Menú al cerrar.

### Qué observar

- Texto cortado, botones inaccesibles, scroll bloqueado o overlays que no cierran.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CRM-005 — 404 y rutas próximas

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Sesión válida.

### Pasos

1. Abrir `/app/ruta-inexistente`.
2. Abrir `/app/projects`, `/app/crm` y `/app/settings`.

### Resultado esperado

- La ruta desconocida muestra `Próximamente` dentro del shell.
- Las tres rutas anunciadas como próximas no se confunden con módulos disponibles.

### Qué observar

- No reportar como funcionalidad faltante aquello que el producto marca explícitamente como próximo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CRM-006 — Logout desde cualquier módulo

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- CRM-001 PASS.

### Pasos

1. Abrir dos módulos distintos.
2. Pulsar `Salir`.
3. Intentar volver con Back y abrir un deep link.

### Resultado esperado

- La sesión se invalida y las páginas protegidas requieren login.

### Qué observar

- No debe quedar información privada navegable tras reload.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 5 — Leads UI

## LEADS-001 — Empty state y KPIs

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Base limpia.

### Pasos

1. Abrir `Leads`.
2. Revisar KPIs: totales, nuevos, calificados, contactar, respondieron, reuniones y oportunidades.

### Resultado esperado

- Todos los KPIs son 0.
- El empty state indica que todavía no hay Leads.
- Procesos indica que no hay procesos activos.

### Qué observar

- No aparecen Jobs históricos después del reset.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-002 — Filtros individuales

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Fixture con varios Leads de estados y categorías distintas.

### Pasos

1. Probar `Buscar` por empresa/dominio/contacto.
2. Probar categoría.
3. Probar estado.
4. Probar score mínimo.
5. Probar oferta.

### Resultado esperado

- Cada filtro actualiza la consulta y muestra sólo coincidencias.
- El estado vacío distingue “sin Leads” de “sin resultados para estos filtros”.

### Qué observar

- No se debe filtrar client-side ocultando datos de otro tenant.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-003 — Combinación y limpieza de filtros

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- LEADS-002 PASS.

### Pasos

1. Combinar búsqueda, categoría, estado, score y oferta.
2. Recargar.
3. Limpiar cada filtro manualmente.

### Resultado esperado

- La combinación es AND según los parámetros enviados.
- Al limpiar vuelven todos los resultados permitidos.

### Qué observar

- No debe quedar un filtro invisible después de refresh.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-004 — Tabla, teclado y detalle

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- Fixture con al menos un Lead.

### Pasos

1. Abrir Leads.
2. Hacer click en una fila.
3. Repetir usando Tab y Enter.
4. Cerrar el drawer.

### Resultado esperado

- Se muestran empresa, dominio, categoría, ubicación, score, oferta, estado, contacto, próxima acción y fecha.
- El drawer muestra empresa, contacto, presencia digital, comercial, notas y procesos.

### Qué observar

- Links externos abren con `target=_blank` y `rel=noreferrer`.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-005 — Estado permitido

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Lead fixture y usuario con `crm.manage`.

### Pasos

1. Abrir detalle.
2. Cambiar el estado a un valor permitido.
3. Esperar respuesta y recargar.

### Resultado esperado

- Se guarda el nuevo estado.
- El KPI/filtro correspondiente se actualiza.
- Usuario sin `crm.manage` ve el selector deshabilitado.

### Qué observar

- No probar estados arbitrarios por UI.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-006 — Calidad visual y datos incompletos

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Fixture con campos opcionales vacíos.

### Pasos

1. Abrir detalle con website, phone, contacto, score y notas ausentes.
2. Revisar tabla y drawer en mobile.

### Resultado esperado

- Se muestra `—`, `Sin contacto` o `Sin notas todavía` según corresponda.
- No se rompen layouts ni links.

### Qué observar

- No convertir campos vacíos en strings engañosos.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-007 — Links y escape de contenido

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture con URLs válidas y texto con caracteres HTML.

### Pasos

1. Abrir el detalle.
2. Revisar website, Maps, Instagram y LinkedIn.
3. Verificar texto con `<script>` literal en fixture seguro.

### Resultado esperado

- URLs válidas abren en nueva pestaña.
- Texto se renderiza como texto, nunca como HTML ejecutable.

### Qué observar

- No usar payloads destructivos ni XSS real.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## LEADS-008 — Procesos e historial

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture con Jobs de estados distintos.

### Pasos

1. Revisar la sección Procesos.
2. Comparar label, status, duración, progreso, correctos y errores.
3. Confirmar que un Job terminado no muestra cancelar.

### Resultado esperado

- Estados visibles: En cola, Ejecutando, Completado, Fallido, Cancelado.
- Jobs activos se actualizan aproximadamente cada 2,5 segundos.

### Qué observar

- Un Job `external_persist` muestra categoría, ubicación y métricas persistidas.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 6 — Buscar Leads

## FIND-001 — Abrir y cerrar modal

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Usuario con `crm.manage`.

### Pasos

1. En Leads pulsar `Buscar Leads`.
2. Cerrar con `Cerrar`.
3. Reabrir y cerrar haciendo click en el backdrop.

### Resultado esperado

- Modal `Buscar Leads` abre y cierra sin crear Job.
- El foco y la página quedan utilizables.

### Qué observar

- No se llama `POST /leads/jobs` al abrir o cerrar.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## FIND-002 — Categorías y cantidad default

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- FIND-001 PASS.

### Pasos

1. Abrir el modal.
2. Esperar la carga del selector.
3. Revisar que la categoría seleccionada sea `Inmobiliaria`.
4. Revisar la cantidad inicial.

### Resultado esperado

- Las opciones vienen de `GET /leads/finder/categories`.
- El catálogo real auditado contiene 37 categorías actualmente; la documentación previa lo llama 38. No agregar categorías manuales.
- Default: 10.

### Qué observar

- Registrar esta discrepancia como P2 documental si se requiere que sean exactamente 38.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## FIND-003 — Cantidades 5, 10 y 25

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Modal abierto.

### Pasos

1. Seleccionar 5.
2. Seleccionar 10.
3. Seleccionar 25.
4. Intentar introducir manualmente 1, 4, 50 o 100 si el control lo permite.

### Resultado esperado

- Sólo están disponibles 5, 10 y 25.
- Backend rechaza cualquier otro valor con HTTP 400.

### Qué observar

- Frontend no es la autoridad de validación.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## FIND-004 — Ubicación válida

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Modal abierto.

### Pasos

1. Seleccionar `Inmobiliaria`.
2. Escribir `Villa Carlos Paz, Córdoba`.
3. Seleccionar 5.

### Resultado esperado

- El botón de crear queda habilitado.
- El valor se conserva sin espacios externos.

### Qué observar

- No crear el Job todavía si la fase 6 se está ejecutando como UI-only.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## FIND-005 — Ubicación vacía y categoría faltante

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Modal abierto.

### Pasos

1. Dejar ubicación vacía.
2. Intentar enviar.
3. Probar sólo espacios.
4. Desde un cliente de fixture enviar categoría inválida o faltante.

### Resultado esperado

- El navegador bloquea ubicación vacía.
- API devuelve HTTP 400 para ubicación o categoría inválida.
- No se crea Job.

### Qué observar

- No usar SQL para comprobarlo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## FIND-006 — Payload y organización derivada

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Usuario con `crm.manage`.
- Ubicación de prueba acordada.

### Pasos

1. Abrir Network.
2. Crear una búsqueda controlada de 5 sólo cuando se autorice la primera prueba productiva.
3. Inspeccionar el body sin copiar cookies ni tokens.

### Resultado esperado

- `POST /leads/jobs`.
- `type: FINDER`.
- `metadata.mode: external_persist`.
- `metadata.search.category`, `location`, `limit`.
- No contiene `FINDER_SERVICE_SECRET`, Queue ID, Queue token ni organization ID agregado artificialmente por el frontend.

### Qué observar

- La organización se deriva de la sesión y `X-Organization-Id` normal del cliente.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network: método, URL, status y body sin credenciales.
- Logs:
- Notas:

## FIND-007 — Loading y doble click

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- UI preparada para crear un Job de fixture.

### Pasos

1. Enviar una búsqueda.
2. Hacer doble click inmediatamente.
3. Observar el botón durante la request.

### Resultado esperado

- El botón se deshabilita y muestra `Creando búsqueda…`.
- Sólo se realiza una request.
- Sólo se crea un Job.

### Qué observar

- No repetir en producción si ya se creó un Job; usar mocks para el caso de doble click.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network: cantidad de POSTs, sin headers sensibles.
- Logs:
- Notas:

## FIND-008 — Job creado y diagnóstico aislado

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job fixture o primera prueba aprobada.

### Pasos

1. Confirmar que el Job aparece en Procesos como `Finder` y `En cola` inicialmente.
2. Abrir `Diagnóstico`.
3. Confirmar que `Probar motor de procesos` y `Probar Finder externo` no dominan la UX principal.

### Resultado esperado

- La acción principal es `Buscar Leads`.
- Las acciones técnicas quedan separadas.

### Qué observar

- No pulsar botones de diagnóstico durante el smoke comercial.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 7 — Finder comercial de 5 Leads

Esta es la primera prueba manual real recomendada. Ejecutarla sólo después de que Fases 0–6 estén PASS.

## FIND5-001 — Crear y ejecutar búsqueda de 5

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Base limpia o baseline registrado.
- `FINDER_SERVICE_SECRET` provisionado, verificado sólo por nombre.
- Runner local configurado en `services/finder/.env.local`.
- Chromium instalado.

### Pasos — CRM

1. Abrir `https://crm.corsteno.com/app/leads`.
2. Pulsar `Buscar Leads`.
3. Categoría: `Inmobiliaria`.
4. Ubicación: `Villa Carlos Paz, Córdoba`.
5. Cantidad: `5`.
6. Crear la búsqueda.
7. Confirmar que aparece inicialmente como `En cola`.

### Pasos — terminal

Desde la raíz del repositorio:

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder runner pull-once
```

Ejecutar exactamente una vez por Job. No ejecutar `pull-once` si no existe un Job `QUEUED` autorizado.

### Resultado esperado

- Queue message received.
- Job pasa a `RUNNING`.
- Chromium inicia.
- Google Maps se procesa.
- El runner envía batches de hasta 5.
- Job termina `COMPLETED` o completado parcialmente seguro si la fuente se agota.
- El mensaje se ACKea.

### Qué observar

- `requestedLeads` = 5.
- `candidatesSeen`.
- `duplicates`.
- `leadsCreated`.
- `invalidCandidates`.
- `errors`, `blocked`, `durationSeconds`.
- Backlog vuelve a 0.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot del Job:
- Network:
- Terminal sin secrets:
- Queue metrics:
- Notas:

## FIND5-002 — Validar Leads creados

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- FIND5-001 terminó.

### Pasos

1. Abrir cada Lead nuevo.
2. Revisar nombre, categoría, ciudad, provincia, website, domain, phone, dirección, Maps URL, source, sourceReference y status.
3. Confirmar que el estado inicial sea `NEW`.

### Resultado esperado

- Los Leads pertenecen a `Corsteno`.
- Los campos disponibles son limpios y consistentes.
- No hay Leads de otro tenant.

### Qué observar

- La etapa no incluye Enricher, Scoring ni Outreach.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network:
- Logs:
- Lead IDs:
- Notas:

## FIND5-003 — ACK, backlog y ausencia de DLQ

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- FIND5-001 terminado.

### Pasos

1. Consultar métricas read-only de `corsteno-finder-jobs`.
2. Revisar attempts, backlog y DLQ.
3. No reintentar manualmente si el ACK ya ocurrió.

### Resultado esperado

- Backlog: 0.
- ACK confirmado por el runner/Queue.
- No hay retry inesperado.
- No hay mensaje en DLQ.

### Qué observar

- Si el runner falló, conservar evidencia y no crear otro Job automáticamente.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs sin secrets:
- Notas:

## FIND5-004 — Logs y secretos

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- FIND5-001 terminado.

### Pasos

1. Revisar logs del runner y del Worker.
2. Buscar sólo los nombres de variables y patrones prohibidos, sin copiar valores.

### Resultado esperado

- No aparecen `CF_QUEUES_API_TOKEN`, valores de `FINDER_SERVICE_SECRET`, cookies, HMAC raw ni Authorization headers.

### Qué observar

- Si aparece cualquier secret, detener todo testing y rotar según el procedimiento de seguridad.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network:
- Logs:
- Notas:

---

# Fase 8 — Dedupe real

## DEDUPE-001 — Repetición segura de búsqueda

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- FIND5 PASS.
- Baseline de Leads registrado.

### Pasos

1. Repetir la misma búsqueda sólo si el volumen adicional está aprobado.
2. Ejecutar un único `pull-once` para el Job nuevo.
3. Comparar Leads y métricas.

### Resultado esperado

- Los candidatos existentes resultan `duplicate`.
- No se crean filas duplicadas.
- Los duplicados no consumen `requestedLeads`.

### Qué observar

- Google Maps puede devolver negocios distintos; no declarar fallo de dedupe sólo porque no repita exactamente los resultados.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Lead IDs:
- Notas:

## DEDUPE-002 — Source reference

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture automatizado o entorno controlado con el mismo `sourceReference`.

### Pasos

1. Enviar el mismo candidato dos veces al flujo interno de prueba autorizado.
2. Consultar el resultado del batch.

### Resultado esperado

- Primera inserción: `created`.
- Segunda: `duplicate`.
- `leadsCreated` de la segunda: 0.

### Qué observar

- No usar el endpoint HMAC interno desde el frontend.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## DEDUPE-003 — Maps URL y domain/location

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture con candidatos equivalentes por Maps URL y por domain + location.

### Pasos

1. Ejecutar fixture con Maps URL normalizada.
2. Ejecutar fixture con domain y location coincidentes.
3. Comparar IDs.

### Resultado esperado

- Se reutiliza el mismo Lead por la prioridad de claves.
- La deduplicación es tenant-scoped.

### Qué observar

- No asumir que nombre solo alcanza si existe una clave más fuerte.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## DEDUPE-004 — Name/location fallback

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Fixture sin source reference, Maps URL ni domain.

### Pasos

1. Enviar dos candidatos con mismo nombre y ubicación normalizada.
2. Comparar respuesta.

### Resultado esperado

- El segundo se marca duplicate.
- No se crean Leads duplicados.

### Qué observar

- Registrar falsos positivos como P1 si negocios distintos colisionan.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 9 — Finder de 10 Leads

## FIND10-001 — Batches y objetivo 10

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- FIND5 y dedupe PASS.
- No ejecutar si existe un Job activo.

### Pasos

1. Crear una búsqueda aprobada con categoría `restaurante premium` y ubicación `Córdoba Capital`.
2. Seleccionar 10.
3. Ejecutar una vez `python -m finder runner pull-once`.
4. Observar batches y métricas.

### Resultado esperado

- Se procesa en lotes pequeños, no como una única acumulación de 10/25.
- Se detiene al crear 10 Leads nuevos o al safety cap.
- Duplicados no consumen el objetivo.

### Qué observar

- `leadsCreated <= requestedLeads`.
- `candidatesSeen` puede ser mayor que `leadsCreated`.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Terminal:
- Queue:
- Notas:

## FIND10-002 — Estabilidad y duración

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- FIND10-001 terminó.

### Pasos

1. Registrar duración total.
2. Registrar tiempo por batch si está disponible.
3. Revisar consumo visual de navegador y respuesta de UI.

### Resultado esperado

- Job termina sin errores repetidos, backlog en 0 y ACK.
- La UI permanece usable.

### Qué observar

- No comparar tiempos sin anotar categoría, ubicación y cantidad.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Tabla de tiempos:
- Notas:

---

# Fase 10 — Finder de 25 Leads

## FIND25-001 — Safety cap y rendimiento

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- FIND5 y FIND10 PASS.
- Aprobación explícita para crear hasta 25 Leads.

### Pasos

1. Crear búsqueda de 25 con una categoría y ubicación acordadas.
2. Ejecutar un único `pull-once`.
3. Registrar candidatos, batches, duración, backlog y memoria aproximada del proceso.

### Resultado esperado

- Se crean como máximo 25 Leads nuevos.
- El safety cap es 75 candidatos (`3 × 25`).
- No hay loop infinito.

### Qué observar

- Chromium no se queda abierto.
- La Queue no acumula mensajes.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Terminal:
- Queue:
- Notas:

## FIND25-002 — Criterio de detención manual

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- FIND25-001 en ejecución.

### Pasos

1. Detener la observación y cancelar si hay job infinito, backlog creciente, Chromium colgado, errores repetidos o challenge severo.
2. No matar procesos sin registrar el estado del Job.

### Resultado esperado

- La cancelación deja el Job en estado seguro.
- Los Leads ya persistidos permanecen.
- No se crea otro Job como “reintento” automático.

### Qué observar

- Aplicar reglas STOP inmediatamente.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 11 — Partial completion

## PARTIAL-001 — Fuente agotada o safety cap

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Fixture o escenario controlado con muchos duplicados y pocos candidatos nuevos.

### Pasos

1. Solicitar 10 o 25.
2. Ejecutar el escenario controlado.
3. Esperar agotamiento de resultados o safety cap.

### Resultado esperado

- Job finaliza completado parcialmente, no `FAILED`, si Finder funcionó correctamente.
- `leadsCreated` es menor que `requestedLeads`.
- Leads ya creados permanecen.

### Qué observar

- La UI muestra métricas suficientes para explicar el parcial.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PARTIAL-002 — Bloqueo natural

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Sólo observar un bloqueo natural; no provocar CAPTCHA.

### Pasos

1. Si Google Maps muestra un challenge durante una búsqueda autorizada, dejar que Finder lo detecte.
2. No intentar evadirlo.
3. Revisar cleanup y estado final.

### Resultado esperado

- `blocked: true` o indicación equivalente.
- Job no queda infinito.
- Leads previos permanecen.
- Chromium se cierra.

### Qué observar

- Repetición de CAPTCHA es regla STOP.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 12 — Cancelación

## CANCEL-001 — Cancelar QUEUED

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job `QUEUED` de fixture o de una búsqueda aprobada.

### Pasos

1. Abrir Leads → Procesos.
2. Pulsar `Cancelar` antes de `pull-once`.

### Resultado esperado

- Job pasa a `CANCELLED`.
- No se procesa mensaje.
- No se crean Leads.

### Qué observar

- No ejecutar otro `pull-once` para ese Job.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CANCEL-002 — Cancelar RUNNING

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Job `RUNNING` controlado.

### Pasos

1. Iniciar runner con una búsqueda aprobada.
2. Mientras está `RUNNING`, pulsar `Cancelar`.
3. Esperar la respuesta del batch o el siguiente punto seguro.

### Resultado esperado

- Se detiene entre batches.
- Leads ya creados permanecen.
- No se crean nuevos batches después de cancelar.
- Job termina `CANCELLED`.

### Qué observar

- Chromium se cierra.
- El mensaje se ACKea si el Job ya está cancelado.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CANCEL-003 — Cancelar después de algunos Leads

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Job con al menos un batch creado.

### Pasos

1. Cancelar después de observar `leadsCreated > 0`.
2. Recargar Leads.
3. Consultar el Job.

### Resultado esperado

- Los Leads persistidos no desaparecen.
- `processed` deja de crecer.
- No hay duplicate creation por la cancelación.

### Qué observar

- Registrar exactamente cuántos Leads quedaron.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## CANCEL-004 — No reanudación accidental

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job `CANCELLED`.

### Pasos

1. Recargar CRM.
2. Esperar más de un intervalo de actualización.
3. No ejecutar `pull-once`.

### Resultado esperado

- Job continúa `CANCELLED`.
- No aparecen nuevos Leads.

### Qué observar

- El botón Cancelar desaparece para el Job cancelado.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 13 — Refresh y browser durante Finder

## BROWSER-001 — Refresh y otra pestaña

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job `RUNNING` autorizado.

### Pasos

1. Recargar Leads durante el Job.
2. Abrir `/app/leads` en otra pestaña.
3. Observar el mismo Job.

### Resultado esperado

- El estado se recupera desde D1.
- No se crea otro Job.
- El runner continúa independientemente de la UI.

### Qué observar

- La UI no hace polling directo a Queue.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## BROWSER-002 — Cerrar CRM durante Finder

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job `RUNNING` y runner separado.

### Pasos

1. Cerrar la pestaña del CRM.
2. Dejar que el runner termine.
3. Abrir nuevamente el CRM.

### Resultado esperado

- El proceso no depende de que el frontend permanezca abierto.
- La página muestra el estado final desde D1.

### Qué observar

- No cerrar la terminal del runner durante esta prueba.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 14 — Runner y configuración local

## RUN-001 — Doctor y `.env.local`

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Entorno Python local.

### Pasos

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder doctor
```

1. Confirmar Python, Playwright, Chromium, launch y cleanup.
2. Confirmar que `.env.local` existe y está ignorado, sin imprimirlo.

### Resultado esperado

- Doctor PASS.
- No accede a D1 ni crea Leads.

### Qué observar

- Nunca ejecutar `Get-Content services/finder/.env.local` en una terminal compartida.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## RUN-002 — Variables faltantes

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- Copia temporal del entorno en una máquina de test, nunca producción.

### Pasos

1. Quitar temporalmente una variable en un proceso hijo o mock.
2. Ejecutar `python -m finder runner pull-once` sin mensaje productivo.
3. Restaurar el entorno sin imprimir valores.

### Resultado esperado

- El runner informa sólo el nombre de variable faltante.
- No inicia navegador ni modifica Queue.

### Qué observar

- Variables: `CORSTENO_API_BASE_URL`, `CF_ACCOUNT_ID`, `CF_FINDER_QUEUE_ID`, `CF_QUEUES_API_TOKEN`, `FINDER_SERVICE_SECRET`.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## RUN-003 — Queue vacía y mensaje inválido

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- Queue sin mensajes productivos.
- Fixture/mock para mensaje inválido.

### Pasos

1. Ejecutar `pull-once` con Queue vacía.
2. En mock, probar payload sin `version`, `jobId` u `organizationId`.

### Resultado esperado

- Queue vacía: salida `No messages`, sin error.
- Payload inválido: se ACKea como stale sin llamar al Finder.

### Qué observar

- No publicar manualmente un mensaje inválido en producción.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## RUN-004 — Retry y override de entorno

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Mock de Queue/API o entorno no productivo.

### Pasos

1. Probar un override de variable en el proceso hijo.
2. Simular API/Queue temporalmente inaccesible.
3. Observar el comportamiento del runner.

### Resultado esperado

- El entorno del proceso tiene prioridad sobre `.env.local`.
- Fallo transitorio: retry con demora, no `FAILED` permanente inmediato.
- No se imprimen credenciales.

### Qué observar

- No probar cambiando el token real ni la URL productiva en una terminal compartida.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 15 — Playwright y Finder Core

## PLAY-001 — Dry-run headless sin persistencia

Prioridad: P1 CRITICAL · Bloqueante: No

### Precondiciones

- Chromium instalado.

### Pasos

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder dry-run --category inmobiliaria --location "Villa Carlos Paz, Córdoba" --limit 3
```

1. Revisar el resultado local.
2. Confirmar que no se llama al API.

### Resultado esperado

- Finder devuelve candidatos o un bloqueo explícito.
- No crea Job, Lead ni Queue message.
- El archivo temporal queda en `services/finder/tmp` y está ignorado.

### Qué observar

- No usar este comando como sustituto del smoke E2E.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Archivo JSONL: sólo ubicación, no datos sensibles innecesarios.
- Notas:

## PLAY-002 — Headed y extracción de detalle

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Prueba local aprobada, sin API ni producción.

### Pasos

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder dry-run --category inmobiliaria --location "Villa Carlos Paz, Córdoba" --limit 3 --headed
```

1. Observar navegación de Maps.
2. Revisar detalle, teléfono, website, categoría opcional y source reference.

### Resultado esperado

- El navegador abre y se cierra correctamente.
- Datos faltantes se representan como opcionales, no como strings engañosos.

### Qué observar

- No intentar evadir CAPTCHA.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## PLAY-003 — Selectores y cleanup

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- PLAY-001 o PLAY-002 iniciado.

### Pasos

1. Revisar que los selectores estén centralizados en `services/finder/finder/selectors.py`.
2. Forzar sólo un timeout local controlado.
3. Confirmar cierre de page, context y browser.

### Resultado esperado

- Timeout o selector error termina de forma controlada.
- No quedan procesos Chromium huérfanos.

### Qué observar

- No ejecutar loops de reintento agresivos.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 16 — CAPTCHA / blocked

## BLOCK-001 — Bloqueo natural y recuperación

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Sólo un evento natural durante una prueba autorizada.

### Pasos

1. No provocar tráfico adicional para generar CAPTCHA.
2. Si ocurre un challenge, dejar que Finder lo detecte.
3. Revisar Job, Queue y procesos Chromium.
4. Esperar recuperación manual antes de cualquier nueva prueba.

### Resultado esperado

- Finder informa blocked.
- No intenta evasión.
- Job no queda infinito.
- Mensaje recibe el tratamiento de retry/ACK previsto.
- Leads ya creados permanecen.

### Qué observar

- CAPTCHA repetido, bloqueo severo o backlog creciente activa STOP.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 17 — Network errors

## NET-001 — API inaccesible, timeout y 500

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Mock o entorno no productivo.

### Pasos

1. Simular timeout y 500 desde un mock.
2. Ejecutar el flujo del runner.
3. Observar retry y estado del mensaje.

### Resultado esperado

- Fallo transitorio no crea duplicados.
- La Queue conserva el mensaje para retry según configuración.
- No se registra contenido sensible.

### Qué observar

- No cortar API productiva deliberadamente.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## NET-002 — 429 y retry

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Mock de respuesta 429.

### Pasos

1. Ejecutar el cliente contra el mock.
2. Revisar backoff, retry y ACK.

### Resultado esperado

- No se marca éxito falso.
- El mensaje no se pierde.
- No hay loop local infinito.

### Qué observar

- Registrar status y timestamps, no headers sensibles.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 18 — Job idempotency

## IDEM-001 — Estados terminales y mensaje duplicado

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixtures de `RUNNING`, `COMPLETED`, `CANCELLED` y `FAILED`.

### Pasos

1. Procesar un mensaje duplicado para cada estado.
2. Repetir claim/complete en fixture.

### Resultado esperado

- Jobs terminales no vuelven a ejecutarse.
- No se crean Leads adicionales.
- Un Job `RUNNING` no se reclama dos veces.

### Qué observar

- No publicar manualmente mensajes duplicados en producción.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

## IDEM-002 — Retry después de batch

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- Fixture que falla después de persistir un batch.

### Pasos

1. Persistir batch controlado.
2. Simular reentrega.
3. Procesar nuevamente.

### Resultado esperado

- `ON CONFLICT(organization_id,dedupe_key) DO NOTHING` evita duplicados.
- El mismo candidato vuelve como duplicate.
- El tenant queda aislado.

### Qué observar

- Registrar IDs, no datos sensibles.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 19 — Data quality

## DATA-001 — Checklist por Lead

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Al menos un Lead creado por FIND5.

### Pasos

Revisar cada Lead y marcar:

- [ ] Nombre correcto.
- [ ] Sin prefijo `Sitio web:`.
- [ ] Sin prefijo `Teléfono:` o `Telefono:`.
- [ ] URL limpia.
- [ ] Domain limpio.
- [ ] Teléfono usable o vacío, nunca texto de error.
- [ ] Dirección, ciudad y provincia coherentes.
- [ ] Categoría válida.
- [ ] `source` y `sourceReference` presentes cuando Finder los conoce.
- [ ] `dedupe_key` presente en D1 mediante inspección read-only autorizada.
- [ ] Status inicial `NEW`.
- [ ] Timestamps válidos.

### Resultado esperado

- Cada fila tiene datos consistentes con FinderCandidate.
- Los opcionales faltantes permanecen null/vacíos, no inventados.

### Qué observar

- No editar masivamente para “arreglar” el resultado de una prueba.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network:
- Logs:
- Lead IDs:
- Notas:

---

# Fase 20 — Job metrics

## METRIC-001 — Invariantes y reconciliación

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Job terminado con metadata visible.

### Pasos

1. Registrar `requestedLeads`, `leadsCreated`, `duplicates`, `invalidCandidates`, `candidatesSeen`, `errors`, `blocked`, `durationSeconds`.
2. Comparar con el número real de Leads nuevos.
3. Revisar el progreso.

### Resultado esperado

- `leadsCreated <= requestedLeads`.
- `leadsCreated` coincide con filas nuevas del Job.
- Duplicados no incrementan `leadsCreated`.
- Invalid candidates no cuentan como creados.
- `candidatesSeen >= leadsCreated`.
- `durationSeconds` es finito y no negativo.
- `blocked` explica una detención bloqueada.

### Qué observar

- Un parcial puede tener progreso menor a 100% si no alcanzó el objetivo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Tabla de métricas:
- Notas:

---

# Fase 21 — D1 read-only

## D1-001 — Conteos, claves, índices y huérfanos

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- No tener Jobs activos, salvo el que se esté observando.

### Pasos

1. Ejecutar sólo lecturas sobre `corsteno-db`:

   ```sql
   SELECT COUNT(*) FROM leads;
   SELECT COUNT(*) FROM lead_jobs;
   SELECT organization_id, COUNT(*) FROM leads GROUP BY organization_id;
   SELECT organization_id, COUNT(*) FROM lead_jobs GROUP BY organization_id;
   SELECT name, sql FROM sqlite_master WHERE type='index' AND name='leads_org_dedupe_key';
   SELECT COUNT(*) FROM d1_migrations;
   PRAGMA foreign_keys;
   ```

2. Buscar Leads sin organización y Jobs sin organización mediante `LEFT JOIN` read-only.
3. No ejecutar `PRAGMA foreign_keys=OFF`.

### Resultado esperado

- No hay huérfanos.
- Existe el índice único `leads_org_dedupe_key`.
- Migraciones permanecen intactas.
- Integridad referencial no fue deshabilitada permanentemente.

### Qué observar

- En testing productivo, guardar sólo conteos e IDs de evidencia estrictamente necesarios.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Query results resumidos:
- Notas:

---

# Fase 22 — Queues

## QUEUE-001 — Producer, pull, retry, ACK y DLQ

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- PRE-004 PASS.
- Un Job de prueba aprobado o fixture.

### Pasos

1. Confirmar Producer remoto de `corsteno-finder-jobs`.
2. Crear un único Job aprobado y observar que ingresa.
3. Ejecutar `pull-once`.
4. Revisar HTTP Pull, visibility timeout, attempts, ACK y DLQ.
5. Revisar `corsteno-lead-jobs` sin modificarla.

### Resultado esperado

- El mensaje se entrega una vez al runner.
- Retry sólo ocurre ante fallo transitorio.
- ACK deja backlog en 0.
- DLQ queda vacío si no hubo fallo permanente.

### Qué observar

- No alterar configuración de Queue sólo para probar.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Queue metrics:
- Logs:
- Notas:

---

# Fase 23 — Seguridad

## SEC-001 — Checklist de superficie de ataque

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- No ejecutar payloads destructivos.

### Pasos

Revisar:

- [ ] No hay secrets en el bundle frontend.
- [ ] Queue token no aparece en Git.
- [ ] Finder secret no aparece en Git.
- [ ] `services/finder/.env.local` está ignorado.
- [ ] Logs no contienen secrets, cookies, HMAC raw ni Authorization.
- [ ] HMAC correcto acepta sólo timestamp vigente.
- [ ] HMAC incorrecto, body alterado y timestamp vencido son rechazados en fixture.
- [ ] La API exige sesión, organización y permiso.
- [ ] Inputs de búsqueda rechazan categoría inválida y ubicación vacía.
- [ ] Nombres de Leads se escapan como texto.
- [ ] URLs externas no ejecutan JavaScript.
- [ ] IDs de otro tenant son rechazados.

### Resultado esperado

- No hay exposición de credenciales ni bypass de autorización.

### Qué observar

- Si se encuentra un secret, activar STOP y no continuar con más pruebas.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot censurado:
- Network:
- Logs:
- Notas:

---

# Fase 24 — Performance

## PERF-001 — Registro comparativo

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- FIND5, FIND10 y FIND25 aprobados individualmente.

### Pasos

Completar esta tabla sin comparar pruebas con parámetros distintos:

| Cantidad | Categoría | Ubicación | Duración | Candidates/sec | API latency | Leads creados | Observaciones |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 5 |  |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |  |
| 25 |  |  |  |  |  |  |  |

1. Registrar responsiveness del UI.
2. Registrar uso aproximado de memoria de Chromium.
3. Revisar que el polling no genere requests excesivas.

### Resultado esperado

- No hay degradación que bloquee el uso.
- No hay crecimiento infinito de procesos o Queue backlog.

### Qué observar

- Definir umbrales con el equipo antes de usar este resultado como GO comercial.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Tabla:
- Notas:

---

# Fase 25 — UX

## UX-001 — Evaluación de flujo

Prioridad: P2 MAJOR · Bloqueante: No

### Precondiciones

- Al menos FIND5 PASS.

### Pasos

Puntuar 1–5 y anotar evidencia:

| Criterio | Score 1–5 | Notas |
| --- | ---: | --- |
| Claridad de `Buscar Leads` |  |  |
| Claridad del formulario |  |  |
| Feedback de loading |  |  |
| Mensajes de error |  |  |
| Progreso del Job |  |  |
| Métricas |  |  |
| Cancelación |  |  |
| Historial de Procesos |  |  |
| Empty states |  |  |
| Responsive |  |  |

### Resultado esperado

- El tester puede completar una búsqueda sin decidir detalles técnicos no documentados.
- Diagnóstico queda separado de la acción comercial.

### Qué observar

- No considerar terminado el flujo si una persona no técnica necesita manipular Queue o D1 para entenderlo.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 26 — Regresión

## REG-001 — Regresión post-Finder

Prioridad: P0 BLOCKER · Bloqueante: Sí

### Precondiciones

- FIND5 finalizado y métricas registradas.

### Pasos

1. Volver a probar login y logout.
2. Recorrer Resumen, Experiencias, Productos, Resultados, Sitios y canales, Reportes, Actividad, Atención, Archivos y Equipo según permisos.
3. Volver a Leads y revisar que los Jobs/Leads esperados sigan presentes.

### Resultado esperado

- Finder no rompe autenticación, navegación ni módulos existentes.
- No se crean datos fuera del alcance de la prueba.

### Qué observar

- No declarar regresión en módulos marcados `Próximamente`.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- Notas:

---

# Fase 27 — Cleanup post-test

## CLEAN-001 — Planificar limpieza de QA

Prioridad: P1 CRITICAL · Bloqueante: Sí

### Precondiciones

- Todas las pruebas productivas terminaron.
- Lista de Lead IDs y Job IDs creados por QA disponible.

### Pasos

1. No borrar nada desde este documento.
2. Clasificar cada dato creado por QA.
3. Para una limpieza completa autorizada, usar el script administrativo existente sólo con revisión y backup:

   ```powershell
   $env:ENVIRONMENT = "production"
   $env:RESET_PRODUCTION_DATABASE = "corsteno-db"
   $env:RESET_PRODUCTION_ADMIN_EMAIL = "admin@corsteno.com"
   $env:RESET_PRODUCTION_ORGANIZATION_SLUG = "corsteno"
   pnpm data:reset-production -- --execute --confirm-production-reset
   ```

4. No ejecutar este comando como parte del QA normal.

### Resultado esperado

- El plan distingue datos de QA de datos comerciales legítimos.
- No se ejecuta limpieza sin aprobación y backup.

### Qué observar

- El script es destructivo y limpia todos los datos funcionales salvo admin, Corsteno y membership.

### PASS

- [ ] Sí

### FAIL

- [ ] Sí

### Evidencia

- Screenshot:
- Network:
- Logs:
- IDs clasificados:
- Notas:

---

# Bug template

```markdown
Bug ID:
Test ID:
Severidad: P0 / P1 / P2 / P3 / P4
Fecha:
Environment:
Browser / OS:
Steps:
Expected:
Actual:
Screenshot:
Console:
Network:
Job ID:
Lead ID:
Organization context:
Reproducible:
Secrets exposed: No / Sí — detener testing
Notas:
```

# Severidades

- **P0 BLOCKER**: corrupción o exposición de datos/secrets, tenant isolation roto, pérdida de mensajes/Leads, Job infinito o imposibilidad de login.
- **P1 CRITICAL**: función central incorrecta, dedupe roto, cancelación insegura, métricas falsas, datos de Lead corruptos o autorización bypassable.
- **P2 MAJOR**: función importante degradada sin pérdida de datos; workaround razonable.
- **P3 MINOR**: defecto acotado de UI, copy o edge case no bloqueante.
- **P4 COSMETIC**: detalle visual sin impacto operativo.

# Reglas STOP

Detener inmediatamente y registrar un bug P0/P1 si ocurre cualquiera de estos casos:

- Datos de otro tenant visibles.
- Secret, cookie, token, hash, HMAC raw o Authorization header visible.
- Corrupción de D1 o una escritura fuera del alcance.
- Job infinito o Chromium que no termina.
- Duplicados masivos.
- CAPTCHA/challenge repetido o bloqueo severo de Google.
- Queue creciendo sin ACK.
- Worker 500 repetidos.
- Retry que crea Leads duplicados.
- Logout que no invalida la sesión.
- `leadsCreated` no coincide con filas creadas.

# Criterio GO para continuar con Enricher

No comenzar Enricher hasta cumplir todos los requisitos:

- [ ] FIND5 PASS.
- [ ] FIND10 PASS.
- [ ] FIND25 PASS o decisión explícita de postergarlo con justificación.
- [ ] Dedupe por source reference y claves fallback PASS en fixture.
- [ ] Cancelación QUEUED y RUNNING PASS.
- [ ] Partial completion PASS.
- [ ] Retry/idempotencia PASS.
- [ ] Métricas reconciliadas.
- [ ] No hay P0 ni P1 abiertos.
- [ ] No hay datos de otro tenant.
- [ ] No hay secrets en frontend, logs o Git.
- [ ] D1 y Queues sin anomalías.

Resultado: `GO ETAPA ENRICHER` / `NO-GO ETAPA ENRICHER`

# Finder listo vs Sales Engine comercial

**Finder listo para seguir desarrollando** significa que el descubrimiento, persistencia, dedupe, batches, cancelación, partial completion, retries y calidad básica de datos son confiables.

**Sales Engine listo para uso comercial** requiere además módulos que todavía no están implementados: Enricher, Scoring y Outreach. Este documento no declara esos módulos terminados.

# Orden recomendado de ejecución

## Día 1 — Smoke y 5 Leads

1. Fases 0–6.
2. FIND5-001 a FIND5-004.
3. DATA-001.
4. Si hay P0/P1, detener.

## Día 2 — Dedupe y 10 Leads

1. DEDUPE-001 a DEDUPE-004 usando fixtures y una repetición productiva aprobada.
2. FIND10-001 y FIND10-002.
3. METRIC-001.

## Día 3 — 25 Leads y cancelación

1. FIND25-001 y FIND25-002.
2. CANCEL-001 a CANCEL-004.
3. QUEUE-001.

## Día 4 — Errores, partial y regresión

1. PARTIAL-001 y PARTIAL-002.
2. RUN-002 a RUN-004.
3. NET-001 y NET-002.
4. IDEM-001 y IDEM-002.
5. REG-001.

# Inventario de funcionalidades reales

## Implementadas y cubiertas

- Login, logout, sesión con cookie HttpOnly/Secure/SameSite en producción.
- Organización activa, permisos y membresías.
- Dashboard, Experiencias, Productos, Resultados, Sitios y canales, Reportes, Actividad, Atención, Archivos, Equipo, catálogo comercial y suscripciones.
- Leads: listado, KPIs, filtros, detalle, links, estado y Jobs.
- `Buscar Leads` con `external_persist`, cantidades 5/10/25, categorías desde API, batches, dedupe, cancelación y métricas.
- Finder Core con Playwright/Chromium, Google Maps, dry-run, JSONL, detección de bloqueos y cleanup.
- Runner externo con HTTP Pull, HMAC, ACK/retry y `.env.local`.
- D1 productiva, migraciones y Queue bindings descritas en PRECHECK.

## No implementadas o no deben tratarse como terminadas

- Enricher.
- Scoring.
- Outreach.
- Clientes como módulo operativo independiente.
- Proyectos como módulo operativo: la ruta aparece bajo `Próximamente`.
- Configuración como módulo operativo: la ruta aparece bajo `Próximamente`.
- Recuperación de contraseña desde UI: existe herramienta administrativa de reset, no un flujo público de recuperación documentado.
- Finder automático desde frontend: el botón sólo crea el Job; no ejecuta Python ni Playwright.
- Pruebas de CAPTCHA provocado: no deben realizarse.
- Pruebas de expiración de sesión alterando producción: usar fixture/mock.

## Comandos de referencia

Todos son comandos de diagnóstico o ejecución controlada. Revisar la fase correspondiente antes de usarlos.

```powershell
# Health y API
Invoke-WebRequest https://crm.corsteno.com -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://api.corsteno.com/health -UseBasicParsing | Select-Object StatusCode,Content

# Finder local sin persistencia
$env:PYTHONPATH = "services/finder"
python -m finder doctor
python -m finder dry-run --category inmobiliaria --location "Villa Carlos Paz, Córdoba" --limit 3

# Runner externo: sólo con un Job QUEUED autorizado
$env:PYTHONPATH = "services/finder"
python -m finder runner pull-once
```

No ejecutar SQL de escritura, reset productivo, deploy, creación de organizaciones ni rotación de secrets como parte de este manual.
