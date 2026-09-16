# Demo de Revestimientos

El catálogo usa la experiencia `product-catalog`, los productos organizacionales, el runtime público y el canal hosted existentes. La organización, el proyecto, la aplicación, la experiencia, los productos y los assets tienen IDs propios; el seed no borra ni cambia datos de Muebles, Ruleta o Cosquín.

Los productos guardan `priceUnit` y metadata opcionales. La metadata estructurada permite conservar atributos de superficie como material, color, acabado, formato, medidas, ambiente y uso recomendado. La tabla `product_3d_config` continúa reservada para el modelo GLB individual. La configuración de materiales de superficie vive en `product_surface_config`, con borrador y publicación independientes.

## Preparación local

```powershell
pnpm --filter @corsteno/api db:migrate:local
pnpm demo:revestimientos
```

El seed local carga los seis SVG comerciales y los dieciocho mapas PBR WebP en el R2 local, registra los seis `product_surface_config` equivalentes y escribe únicamente la organización y experiencia `revestimientos-demo-catalogo`. Después se puede abrir el runtime de desarrollo en `/r/revestimientos-demo-catalogo`.

## Operación futura de producción

El seed aislado tiene un modo remoto separado. No se ejecutó durante la preparación del demo. Antes de usarlo, hay que confirmar un backup reciente de `corsteno-db` y revisar que el destino sea producción:

```powershell
$env:ENVIRONMENT = 'production'
$env:RESET_PRODUCTION_DATABASE = 'corsteno-db'
$env:CANONICAL_BACKUP_DATABASE = 'corsteno-db'
$env:CANONICAL_BACKUP_PATH = 'RUTA_A_UN_BACKUP_NO_VACIO'
pnpm exec tsx scripts/seed-revestimientos-demo.ts --remote --execute
```

Ese comando carga solamente los assets de Revestimientos (seis imágenes comerciales y dieciocho mapas PBR) y hace upsert de su organización, proyecto, aplicación, experiencia, canal hosted, membresía del admin principal, productos, configuraciones de superficie y asociaciones publicadas. No ejecuta limpieza global ni toca otros slugs.

## Etapa 2 — Visualizador 3D V1 local

La V1 del visualizador funciona únicamente en local; todavía no se despliega ni modifica datos productivos. El catálogo 2D sigue siendo la fuente de los seis productos:

`Product existente → Ver en ambiente → habitación procedural → aplicar material por superficie`

### Etapa 1 — Catálogo 2D (actual)

Los seis productos existentes son la fuente canónica. Cada producto conserva su `productId`, imagen 2D, `priceUnit`, metadata y CTA. Esta etapa sí está desplegada.

`product_3d_config` sigue reservado para el modelo GLB individual y sus transformaciones. Los materiales aplicables a pared y piso se persisten en `product_surface_config`, indexados por el mismo `productId`, con ownership de organización y versiones draft/published. El runtime sólo recibe el contrato público sanitizado y no conoce nombres de productos ni mapas hardcodeados.

El contrato público del catálogo expone el ID público ya existente junto al nombre, precio, unidad, metadata e imágenes. El runtime muestra el botón solo cuando el ID resuelve una configuración válida; los productos sin esa capability, incluidos Muebles, no reciben el CTA. La URL local tiene esta forma:

`/r/revestimientos-demo-catalogo/visualizer/<productId>`

La habitación se construye con planos independientes de 5 × 5 m (piso) y paredes de 5 × 2,9 m. La cámara inicia en un encuadre amplio desde el lado abierto, con órbita acotada, zoom controlado y botones separados para `Restablecer vista` y `Restablecer ambiente`. El selector de superficie muestra `Editando: ...` y elegir un producto lo aplica inmediatamente a esa superficie; el Canvas, renderer y cámara no se recrean al cambiarlo. Los seis registros migrados son materiales `texture` con fallback sólido; las imágenes SVG comerciales sólo aparecen en el catálogo y el selector, nunca como texturas PBR.

La configuración admite modo `texture`, mapas PBR separados, medidas físicas, repetición y rotación. Los seis productos usan Base Color, Normal GL y Roughness cargados desde `apps/runtime/public/materials/revestimientos/<slug>/`. Roble conserva mapas 2K; los otros cinco sets son conversiones locales 1K para mantener el peso inicial controlado. Todos los mapas provienen de materiales de Poly Haven (CC0) y se convirtieron localmente a WebP; los SVG comerciales continúan siendo sólo `Catalog Assets`.

El resolver genérico mantiene un fallback sólido mientras cargan los mapas, conserva un color sólido si falla Base Color y deja el material degradado si falla Normal o Roughness. Las texturas fuente se cachean por URL y rol; cada superficie recibe un clon para poder aplicar repetición, centro y rotación sin mutar otra superficie. El caché también evita volver a descargar Roble al alternar entre productos. Base Color usa `SRGBColorSpace`; Normal y Roughness usan `NoColorSpace`, mipmaps y anisotropía limitada a 4.

Roble está calibrado inicialmente con `physicalWidthM: 0.16`, `physicalHeightM: 2.40` y `rotationDegrees: 90` para orientación vertical. Para los mapas cuadrados nuevos se tomó el ancho físico publicado por Poly Haven y se usó la misma medida como alto del área completa de una repetición; el valor queda explícito y editable en cada configuración. La fórmula existente calcula `repeatX = surfaceWidth / physicalWidthM` y `repeatY = surfaceHeight / physicalHeightM`.

### Inventario PBR local

| Producto | Fuente CC0 | Área calibrada | Mapas locales | Peso total | Rotación | Roughness / normalScale |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| Listón Roble Natural | [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) | 0,16 × 2,40 m | 2048² base/normal/roughness | 6,55 MB | 90° | 0,78 / 0,38 |
| Panel Nórdico Claro | [Kitchen Wood](https://polyhaven.com/a/kitchen_wood) | 0,60 × 0,60 m | 1024² base/normal/roughness | 2,25 MB | 90° | 0,78 / 0,24 |
| Piedra Gris Andina | [Stone Tile Wall](https://polyhaven.com/a/stone_tile_wall) | 2,00 × 2,00 m | 1024² base/normal/roughness | 1,51 MB | 0° | 0,90 / 0,55 |
| Mármol Blanco | [Marble 01](https://polyhaven.com/a/marble_01) | 1,50 × 1,50 m | 1024² base/normal/roughness | 0,63 MB | 0° | 0,28 / 0,22 |
| Cemento Arena | [Concrete Floor](https://polyhaven.com/a/concrete_floor) | 2,10 × 2,10 m | 1024² base/normal/roughness | 2,42 MB | 0° | 0,92 / 0,18 |
| Revestimiento Negro Texturado | [Black Painted Planks](https://polyhaven.com/a/black_painted_planks) | 1,60 × 1,60 m | 1024² base/normal/roughness | 1,73 MB | 90° | 0,82 / 0,32 |

El paquete PBR local completo pesa aproximadamente 15,09 MB (decimal), por
debajo del objetivo inicial de 30–40 MB. Base Color se interpreta en sRGB;
Normal y Roughness se interpretan en `NoColorSpace`. No se usan AO,
displacement, shaders ni efectos anti-tiling. Las cinco fuentes nuevas se
mantienen como mapas repetibles de área completa; la inspección visual en la
habitación no mostró costuras dominantes en la escala de demo.

## Etapa 3 — Surface Material Platform administrable

La capacidad persistida sigue este recorrido:

`Product → product_surface_config (D1) → assets WebP versionados (R2) → API pública sanitizada → runtime genérico`

`product_surface_config` conserva `draft_config` y `published_config`, sus versiones y la organización propietaria. La configuración guarda sólo IDs de assets (`baseColorAssetId`, `normalAssetId`, `roughnessAssetId`), medidas físicas, orientación, rotación, parámetros PBR, superficies compatibles y `enabled`. Un reemplazo de mapa crea otro asset UUID y otra URL inmutable; nunca se sobrescribe el objeto anterior.

Los mapas PBR se cargan con la categoría `surface-material-map`, MIME `image/webp`, firma RIFF/WEBP y un límite de 8 MB por archivo. La API comprueba ownership y estado activo antes de guardar o publicar. El catálogo público sólo expone `surfaceConfig` cuando el registro publicado está habilitado; si una textura publicada pierde su Base Color, la respuesta degrada a un material sólido con `fallbackColor`. Las respuestas contienen URLs públicas, nunca IDs de assets, claves administrativas ni nombres de organización. Los objetos `/assets/*` mantienen `public, max-age=31536000, immutable`.

El editor CRM incorpora la sección `Material 3D / Visualizador` dentro de Productos, con selectores de Base Color, Normal y Roughness, parámetros de escala física y botones separados para guardar borrador y publicar. No exige un preview 3D dentro del CRM. El CTA del catálogo se deriva de `surfaceConfig` publicado; el runtime ya no importa ni compila mapas locales.

Para preparar local o staging equivalente:

```powershell
pnpm --filter @corsteno/api db:migrate:local
pnpm demo:revestimientos
```

El comando anterior usa sólo D1/R2 locales cuando recibe `--local` (el script exige elegir explícitamente el destino) y deja seis productos con sus tres mapas PBR y configuración publicada. No se ejecutó ningún deploy ni escritura remota en esta etapa.

## Etapas futuras

### Ambiente del usuario y AR

Posibles extensiones: cargar una foto del ambiente, segmentar pared/piso, previsualizar el revestimiento, AR/WebXR, capturar la imagen y compartir el resultado. Nada de esto forma parte del deploy 2D.

### Cálculo y presupuesto

Sobre el producto y su unidad actuales se podrían calcular superficie, desperdicio, cantidad de unidades o cajas y un precio estimado. Ejemplo conceptual: pared de 4 m × 2,6 m → 10,4 m² → 11,44 m² con 10 % de desperdicio → estimación según `priceUnit`. No se implementa cálculo ni presupuesto en esta etapa.

No se incluyen en esta V1 ambiente GLB, AR/WebXR, carga de fotos, segmentación,
cálculo de cantidades ni presupuesto. El renderer y Three.js se descargan
recién al abrir la ruta del visualizador. La integración posterior puede mover
estas referencias locales a API/R2 y luego asociarlas al CRM; ese paso requiere
una revisión de ownership, URLs públicas, cache headers y aprobación de
producción.

## Línea base productiva — 2026-09-16

La versión productiva de REVESTIMIENTOS 3D y Surface Material Platform queda
identificada por el tag anotado `revestimientos-3d-v1-production`; el commit
apuntado por ese tag es el checkpoint reproducible de esta entrega.

| Componente | Estado productivo |
| --- | --- |
| API | `https://api.corsteno.com`; deployment `614fb8a1-0ff9-4a52-b045-f7c9d6b77776` |
| Runtime | `https://corsteno-runtime.matiasgerstner.workers.dev`; deployment `af23ce1d-95e7-4e19-a01c-3c78f80b6936` |
| CRM | `https://crm.corsteno.com`; deployment `81afae57-c588-42b4-a329-c8b3c48d0f8c`; runtime base `https://corsteno-runtime.matiasgerstner.workers.dev` |
| D1 | `corsteno-db` (`e028adf0-ed6c-4e20-b74d-59b94910639f`), migración `0032_product_surface_config.sql` aplicada, sin pendientes |
| R2 | Bucket `corsteno-experience-assets`, 18 mapas WebP versionados para los seis productos |
| Contrato público | `revestimientos-demo-catalogo` devuelve seis productos y `surfaceConfig` sanitizado |

El smoke productivo confirmó API, catálogo 2D, visualizador 3D, aplicación de
Roble/Mármol/Cemento, Muebles, Ruleta y Cosquín. Los mapas fuente locales se
conservan como material canónico para reproducibilidad y futuras cargas; no se
eliminan durante el cleanup.
