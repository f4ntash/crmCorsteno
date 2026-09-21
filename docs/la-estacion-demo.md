# Demo comercial: La Estación / TUS ESTACIONES

Esta guía prepara el workspace demo del PEC para la experiencia pública [La Estación](https://corsteno.com/la-estacion). El seed usa únicamente la API de eventos existente y los nombres de evento publicados en `KNOWN_EVENT_NAMES`.

## Identidades preparadas

- Organización: `La Estación` (`la-estacion`)
- Proyecto: `TUS ESTACIONES` (`tus-estaciones`)
- Aplicación: `TUS ESTACIONES` (`tus-estaciones`, tipo `generic`)
- Experiencia asociada: `TUS ESTACIONES` (`tus-estaciones`, tipo `ar`, publicada y marcada como externa)
- `applicationId`: `00000000-0000-4000-8000-000000000082`

La experiencia AR asociada permite que el workspace tenga Analytics habilitado, sin asumir que el PEC aloja o controla el runtime público. La aplicación sigue siendo genérica y recibe eventos por application credential.

## Preparar y ejecutar en local

Aplicar migraciones y tener el API local levantado en otra terminal:

```powershell
pnpm db:migrate:local
pnpm --filter @corsteno/api dev
```

Preparar organización, proyecto, aplicación y experiencia:

```powershell
pnpm demo:la-estacion --local --prepare
```

Crear una credential para la aplicación. El comando muestra el secret una sola vez:

```powershell
pnpm credentials:create --local --application tus-estaciones --execute
```

Guardar el valor mostrado sólo en el entorno local de la terminal y ejecutar el seed:

```powershell
$env:CORSTENO_ANALYTICS_APPLICATION_SECRET = '<secret-mostrado-una-sola-vez>'
$env:API_URL = 'http://127.0.0.1:8787'
pnpm demo:la-estacion --local
```

El script elimina primero los eventos que tengan simultáneamente `application_id=00000000-0000-4000-8000-000000000082` y `properties.demoSeed=la-estacion-demo-v1`, y luego los vuelve a insertar vía `POST /v1/events/batch` en lotes de 50. Ningún evento real sin ese marker se toca.

## Verificación y reset

Verificar los datos sintéticos sin insertar nada:

```powershell
pnpm demo:la-estacion --local --verify
```

El comando debe informar `3689 eventos`, `450 usuarios` y `620 sesiones`, y validar el conteo de cada evento. Ejecutarlo dos veces no incrementa los conteos: la segunda ejecución vuelve a limpiar sólo el marker y termina con los mismos valores.

Resetear únicamente los datos demo:

```powershell
pnpm demo:la-estacion --local --reset
```

El reset no elimina la organización, el proyecto, la aplicación, la experiencia ni credentials. Tampoco toca eventos reales futuros.

## Application credential y secret para `corsteno-stations`

La credential se crea sobre la aplicación, no sobre un usuario del PEC. Sólo se almacena el hash en D1; el secret plano no queda en el repo ni vuelve a estar disponible después de crearla.

```powershell
pnpm credentials:create --local --application tus-estaciones --execute
```

Para crear la credential productiva de `TUS ESTACIONES`, el script remoto exige guardas específicas para esta operación —no exige backup canónico—:

```powershell
$env:ENVIRONMENT = 'production'
$env:RESET_PRODUCTION_DATABASE = 'corsteno-db'
$env:ALLOW_APPLICATION_CREDENTIAL_REMOTE = 'true'
pnpm credentials:create --remote --application tus-estaciones --execute --confirm-remote
```

El comando sólo inserta una nueva credential para la application solicitada. No elimina, revoca ni regenera otras credentials. El secret plano se muestra una sola vez después de confirmar el write en D1. No se ejecutó ningún write remoto como parte de este cambio. La API de destino del Worker es:

```text
POST https://api.corsteno.com/v1/events
Authorization: Bearer <secret>
```

Copiar el secret completo en el Worker de `corsteno-stations` sin commitearlo:

```powershell
wrangler secret put CORSTENO_ANALYTICS_APPLICATION_SECRET
```

El Worker debe conservar ese valor como secret, no como variable pública del frontend. El dashboard del PEC nunca necesita conocer el secret.

## Usuario cliente member

No hay una contraseña fija en este repo. En el PEC, con un owner/admin o administrador de plataforma:

1. Seleccionar el workspace `La Estación`.
2. Abrir `/app/team`.
3. Elegir `Agregar miembro`.
4. Usar nombre `Demo La Estación`, el email real que defina el cliente y una contraseña inicial temporal elegida en ese momento.
5. Seleccionar `member` y guardar.
6. Entregar la contraseña temporal por un canal seguro y pedir que se cambie fuera de este repo si el flujo operativo lo permite.

La pantalla usa `POST /organizations/members`, guarda la contraseña como hash y no la devuelve en la respuesta. El rol `member` puede consultar Analytics, CRM y Actividad mediante `analytics.read`, `crm.read` y `activity.read`, pero no puede administrar la organización, proyectos ni CRM porque no recibe `organization.manage`, `project.manage` ni `crm.manage`.

## Datos demo exactos

Todos los eventos incluyen:

```json
{
  "demo": true,
  "demoSeed": "la-estacion-demo-v1",
  "source": "seed-la-estacion-demo"
}
```

La distribución se genera dentro de los últimos 7 días, con timestamps diferentes y una probabilidad mayor para el horario nocturno argentino, especialmente entre `20:00` y `03:00`. Los conteos son:

| Dato | Conteo |
| --- | ---: |
| Usuarios sintéticos únicos | 450 |
| Sesiones únicas | 620 |
| `app_opened` | 760 |
| `session_started` | 620 |
| `session_ended` | 590 |
| `experience_started` | 310 |
| `experience_finished` | 248 |
| `image_target_detected` | 225 |
| `camera_permission_granted` | 185 |
| `camera_permission_denied` | 28 |
| `button_clicked` / `photo_studio_opened` | 140 |
| `button_clicked` / `photo_captured` | 95 |
| `button_clicked` / `photo_shared` | 58 |
| `button_clicked` / `passport_opened` | 170 |
| `button_clicked` / `station_opened` | 260 |
| Total de eventos | 3.689 |

Los `button_clicked` llevan la propiedad `action` solicitada. Los `image_target_detected` llevan `stationId` y `stationName`; el seed usa seis estaciones sintéticas: Centro `38`, Río `38`, Parque `38`, Norte `37`, Sur `37` y Puerto `37` detecciones.

## Qué debería verse en el PEC

En `/app/analytics`, seleccionar proyecto `TUS ESTACIONES`, aplicación `TUS ESTACIONES` y período `7 días`:

- usuarios únicos: `450`
- sesiones: `620`
- aperturas: `760`
- eventos totales: `3.689`
- evolución diaria de usuarios y eventos, y evolución horaria si se selecciona `24 horas`
- objetivos detectados: `225`
- permisos de cámara concedidos: `185`
- permisos de cámara denegados: `28`
- actividad reciente con predominio nocturno
- breakdown reusable de acciones: Photo Studio abierto `140`, foto tomada `95`, foto compartida `58`, Pasaporte abierto `170`, estación abierta `260`
- breakdown reusable de estaciones detectadas, con seis estaciones sintéticas

El dashboard ya mostraba las métricas base. Se amplió la presentación reusable para cualquier aplicación que envíe `properties.action` o `stationName`/`stationId`: se agregaron breakdowns `action` y `station` en Analytics y sus etiquetas genéricas. No se hardcodeó `La Estación`, `TUS ESTACIONES` ni ninguna estación en el frontend.

## Destino remoto

El seed de La Estación exige `--execute --confirm-remote`, `ENVIRONMENT=production`, `RESET_PRODUCTION_DATABASE=corsteno-db` y `ALLOW_LA_ESTACION_REMOTE=true`. El creador de application credentials usa una guarda independiente: `ALLOW_APPLICATION_CREDENTIAL_REMOTE=true`. Ninguno de estos dos scripts exige `CANONICAL_BACKUP_PATH` ni `CANONICAL_BACKUP_DATABASE`; las guardas de backup canónico se mantienen en los scripts generales de producción.

```powershell
$env:ENVIRONMENT = 'production'
$env:RESET_PRODUCTION_DATABASE = 'corsteno-db'
$env:ALLOW_LA_ESTACION_REMOTE = 'true'
pnpm demo:la-estacion --remote --execute --confirm-remote --prepare
```

`--prepare` sólo hace upsert de la organización, proyecto, aplicación y experiencia con los IDs/slugs reservados para esta demo. No contiene ningún `DELETE` de organizaciones, proyectos o aplicaciones. El seed normal y `--reset` sólo eliminan filas de `events` cuyo `application_id` es la aplicación `TUS ESTACIONES` y cuyo `demoSeed` es `la-estacion-demo-v1`.
