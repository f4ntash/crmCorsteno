# ETAPA 7B — Editor de borradores de Búsqueda del Tesoro

7B mantiene separadas la campaña administrativa, su configuración de borrador y
la versión publicada que consume el runtime. La vista de PEC solo escribe el
borrador; no crea `campaign_versions`, no modifica `campaign_releases` y no
publica targets ni premios.

## Modelo

Treasure Hunt agrega `campaign_drafts`, asociado a una campaña y a su
organización, con `base_campaign_version_id`, `revision`, nombre, slug,
descripción, progresión secuencial y timestamps. Los pasos y el premio viven en
`campaign_draft_steps` y `campaign_draft_rewards`, con restricciones para
`IMAGE_TARGET` y `COUPON`/sin premio. Los pasos pendientes de target quedan
marcados como `PENDING`, por lo que el borrador puede guardarse incompleto.

## API y proxy

El Worker expone, con bearer server-side y organización explícita:

* `POST /v1/admin/hunts`
* `GET /v1/admin/hunts/:campaignId/draft`
* `PUT` o `PATCH /v1/admin/hunts/:campaignId/draft`

PEC mantiene la credencial en su Worker y aplica `crm.read` a lecturas y
`crm.manage` a mutaciones. El navegador solo conoce las rutas de PEC. Cada
respuesta de borrador devuelve `ETag: "<revision>"`; una escritura exige
`If-Match` y una revisión obsoleta devuelve `DRAFT_STALE` (412).

Una campaña nueva queda `PAUSED`, sin versión publicada y fuera del runtime
público hasta una etapa posterior. Para una campaña publicada, `Editar borrador`
crea una sola copia basada en la versión publicada y posteriores aperturas
reutilizan ese borrador. Cambiar el slug de una campaña publicada está bloqueado
en 7B para preservar sus URLs públicas.

## Alcance

El editor permite General, pasos secuenciales, premio cupón o sin premio y
guardado explícito. No incluye publicación, carga o compilación de Image Targets,
assets, delete definitivo, Analytics UI, canjes ni etapas posteriores.
