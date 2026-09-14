# Etapa 3A — Auditoría del Finder existente

Fecha: 2026-09-13

## Alcance

Auditoría de solo lectura. No se ejecutó Finder, no se hizo scraping, no se crearon Leads, no se tocaron D1, Queues, Jobs ni producción.

Código auditado fuera del repositorio:

- `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts\finder.py`
- `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts\enricher.py`
- `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts\priorizar.py`
- `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts\config.json`
- `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts\requirements.txt`

## Hallazgo principal

El README afirma que `finder.py` usa Google Places API, pero el código actual no importa `requests` ni usa `GOOGLE_MAPS_API_KEY`. En realidad usa Playwright para abrir y automatizar `https://www.google.com/maps/search/...`.

Esto mantiene el requisito de no depender de una API paga, pero introduce dependencia de navegador, UI cambiante, CAPTCHA/consentimiento, bloqueo y ejecución gráfica.

## Cómo funciona Finder hoy

1. Lee `config.json`.
2. Permite elegir una o varias categorías mediante índices, rangos o `todas`.
3. Cruza cada categoría elegida con cada localidad.
4. Abre Chromium visible (`headless=False`) con Playwright y locale `es-AR`.
5. Para cada query abre Google Maps Search.
6. Espera la lista `div[role="feed"]`, hace scroll hasta 50 iteraciones y recolecta hasta 80 URLs por query.
7. Abre cada ficha en una segunda pestaña.
8. Extrae nombre, dirección, teléfono, web, categoría Google y URL de Maps.
9. Guarda el resultado en un Excel local.

No usa Google Search orgánico separado. No hay API de Google en el código.

## Dependencias y entorno

`requirements.txt` contiene:

- `pandas` y `openpyxl`: lectura/escritura del estado en Excel.
- `playwright`: automatización de Chromium del Finder.
- `requests` y `beautifulsoup4`: usados por Enricher, no por Finder.

El Finder requiere Python 3.10+ y un navegador Chromium instalado para Playwright. Usa filesystem local, una ventana gráfica y archivos locales. No usa Selenium. No usa sesiones persistentes: crea un contexto nuevo en cada ejecución y no guarda `storage_state`.

No hay dependencia explícita de Windows en el código Python, pero la operación actual depende de una máquina con escritorio/navegador instalado. `--start-maximized` y `headless=False` refuerzan ese supuesto operativo.

## Estado y Excel

El estado persistente es `corsteno_leads.xlsx`, con hojas `Leads` y `Resumen`. Los checkpoints sobrescriben el mismo archivo cada 25 nuevos negocios y al finalizar. No existe una base de estado transaccional ni un cursor de continuación.

La muestra existente tiene 500 filas. Sus columnas son principalmente nombre, categoría/query, dirección, Maps URL, web, teléfono y campos vacíos de enriquecimiento. El archivo no contiene emails ni redes completadas. El priorizado genera otro Excel (`corsteno_leads_priorizados.xlsx`) con scoring comercial; eso no pertenece al Finder.

## Paginación, límite y tiempo

- Una query intenta obtener hasta 80 URLs.
- El scroll tiene hasta 50 iteraciones y se detiene tras cinco iteraciones sin crecimiento.
- El objetivo global es `max_new_leads = 500`.
- El límite se consume solo cuando se agrega un negocio después de deduplicar; los duplicados no consumen el cupo.
- No existe paginación por token ni cursor persistente.
- No existen lotes semánticos para el Job: toda la ejecución de hasta 500 queda dentro de un proceso Python.

No hay benchmark real en el proyecto. Por los delays configurados, la extracción es secuencial y puede tardar desde decenas de minutos hasta bastante más según cantidad de fichas, scrolls y bloqueos.

Delays actuales aproximados:

- carga de búsqueda: 2–4 s;
- cada scroll: 1,5–2,5 s;
- cada ficha: 1,2–2,2 s;
- después de agregar: 0,7–1,5 s.

## Deduplicación actual

El Finder carga las filas existentes del Excel y mantiene claves:

- `google_maps` exacto;
- `nombre` + `direccion`, en minúsculas y con espacios comprimidos.

También mantiene esas dos claves durante la ejecución actual. El código extrae `place_id`, pero no lo utiliza como clave de deduplicación. El `save_excel` final elimina duplicados solo por `google_maps`.

Limitaciones:

- no compara dominio;
- no compara email;
- no compara `sourceReference` porque ese modelo no existe en el Excel;
- no normaliza URLs de Maps;
- no normaliza acentos para nombre/dirección;
- no tiene deduplicación contra D1;
- no tiene una reserva/claim transaccional entre ejecuciones concurrentes.

El comportamiento del cupo sí cumple parcialmente el requisito: el contador aumenta después de descartar duplicados, por lo que 30 duplicados no se cuentan como parte de los 100 nuevos. Para producción, la deduplicación debe vivir en D1 con índices/constraints y una operación atómica de inserción-or-ignore o equivalente.

## Categorías y ubicaciones actuales

`config.json` soporta estas 38 categorías, sin agregar ninguna:

`inmobiliaria`, `desarrolladora inmobiliaria`, `constructora`, `estudio de arquitectura`, `arquitecto`, `diseño de interiores`, `mueblería`, `fábrica de muebles`, `aberturas`, `carpintería de aluminio`, `iluminación`, `casa de electricidad`, `pisos y revestimientos`, `cerámicos`, `sanitarios`, `cocinas`, `decoración`, `piscinas`, `paisajismo`, `hotel`, `hotel boutique`, `cabañas`, `complejo turístico`, `agencia de turismo`, `salón de eventos`, `centro de convenciones`, `productora de eventos`, `concesionaria de autos`, `concesionaria de motos`, `maquinaria agrícola`, `maquinaria industrial`, `fábrica`, `empresa industrial`, `showroom`, `local de diseño`, `bodega`, `restaurante premium`.

Ubicaciones:

- Córdoba Capital, Córdoba, Argentina
- Villa Carlos Paz, Córdoba, Argentina
- Cosquín, Córdoba, Argentina
- La Falda, Córdoba, Argentina
- Jesús María, Córdoba, Argentina
- Alta Gracia, Córdoba, Argentina
- Río Cuarto, Córdoba, Argentina

## Finder versus Enricher

### Finder

Puede producir directamente:

- nombre del negocio;
- categoría solicitada;
- tipo devuelto por Google;
- dirección;
- URL de Google Maps;
- URL del sitio si Google la muestra;
- teléfono si Google lo muestra;
- query de origen;
- `place_id` técnicamente extraído, aunque hoy no se usa bien para deduplicar.

Debe dejar como pendientes, sin inventar valores:

- email;
- Instagram, Facebook, LinkedIn y otras redes;
- contacto y cargo;
- descripción comercial;
- score/oferta/demo.

### Enricher

`enricher.py` lee el Excel y, para cada web pendiente:

- hace `requests.get` con timeout de 15 s y redirects;
- limita HTML a 2 MB;
- parsea con BeautifulSoup;
- busca emails en texto y `mailto:`;
- detecta enlaces a redes sociales;
- detecta hasta tres páginas internas cuyo texto parezca Contacto/About/Nosotros;
- completa descripción desde `meta description` o `<title>`;
- guarda checkpoints cada 25 filas.

Enricher no usa navegador, no visita Google, no tiene retries/backoff explícitos y marca `error: ...` por fila cuando falla. Una fila sin web se marca como enriquecida con `tiene_web = NO`, aunque esto mezcla “no encontrado” con “revisado”.

`priorizar.py` es una tercera etapa local de scoring y recomendación. No es Finder ni Enricher.

## Errores, reintentos e idempotencia

El Finder maneja individualmente muchos errores de extracción con `try/except` y devuelve `None` para una ficha, pero no tiene una política general de retry. Los fallos de navegación/búsqueda pueden abortar la ejecución completa porque el loop principal no envuelve cada query en una política de reintento.

No hay manejo específico de:

- HTTP 429;
- CAPTCHA;
- bloqueo temporal;
- cambios de selectores de Google;
- login requerido;
- circuit breaker;
- backoff exponencial;
- cancelación externa.

La parte de extracción de una ficha puede reintentarse conceptualmente. La escritura del Excel no es idempotente de forma transaccional. La deduplicación es idempotente solo frente al Excel leído al comienzo y URLs exactas.

## Compatibilidad con Cloudflare Workers

No recomiendo ejecutar este Finder directamente dentro de un Worker:

- el código es Python;
- necesita Chromium/Playwright;
- necesita filesystem local y Excel;
- usa una sesión larga, visible y secuencial;
- depende de HTML/selectores de Google Maps;
- no tiene un modelo de request corto;
- Workers no es un runtime de navegador Chromium para este caso;
- D1 no debe ser accedida directamente desde este proceso sin una interfaz autorizada.

Reescribirlo a TypeScript no elimina la incompatibilidad principal: Playwright/Chromium y la ejecución larga seguirían necesitando un runtime externo.

## Opciones arquitectónicas

### A — Reescritura TypeScript para Worker

No recomendada. Exigiría reemplazar Playwright y la interacción UI de Maps, con alto riesgo de cambiar el comportamiento y probablemente introducir otro proveedor o API.

### B — Finder Python externo simple

Viable para un operador, pero insuficiente como arquitectura de Jobs si no tiene cola, checkpoints, cancelación y reporte seguro.

### C — Servicio especializado/container

Viable y directo: imagen Python con Playwright/Chromium, filesystem temporal controlado, logs, límites de concurrencia y ejecución por lotes. Requiere hosting/operación adicional.

### D — Híbrida: CRM/Queue → Finder externo → API/D1

Recomendada. El Worker conserva autorización, tenant, Job y progreso; el Finder externo conserva Python/Chromium. El Finder no recibe un `organizationId` libre desde el usuario y no escribe D1 directamente.

## Arquitectura recomendada

Mantener el Finder Python en un servicio externo controlado, inicialmente con una sola ejecución concurrente por organización o global, y conectarlo mediante un adaptador de Jobs:

```text
CRM autorizado
  → D1 lead_jobs QUEUED
  → Cloudflare Queue
  → dispatcher/consumer
  → Finder Python externo, payload firmado
  → lotes de candidatos
  → endpoint interno de ingestión
  → deduplicación atómica en D1
  → leads + progreso
```

El Finder externo debe recibir `jobId`, un token de servicio limitado y los parámetros del Job. El `organizationId` debe resolverse desde el Job autenticado en el backend, no confiarse a un parámetro público. La respuesta del Finder debe referenciar el `jobId` y no crear un tenant nuevo.

Esta opción conserva el activo existente, cumple el requisito de no pagar Google Maps API, permite Chromium y limita el cambio en Cloudflare. El costo adicional es operar un servicio Python y endurecer su seguridad/observabilidad.

## Lotes, continuation y cancelación

Recomendación inicial:

- lote de búsqueda: 20–40 candidatos por ciclo;
- lote de inserción: 10–25 Leads nuevos por llamada;
- un Job de 100/500 publica continuations, no una ejecución indivisible;
- persistir cursor/query/categoría/localidad y candidatos vistos en metadata durable;
- consultar cancelación antes de cada lote y antes de cada continuation;
- si el Job está `CANCELLED`, el Finder debe detenerse y no publicar otra continuation;
- `processed` = candidatos evaluados;
- `succeeded` = Leads nuevos creados;
- `failed` = candidatos que fallaron de forma no recuperable;
- `duplicates` = contador separado, no consume el cupo solicitado;
- `progress` debe reflejar candidatos procesados sobre el trabajo planificado, con un límite claro cuando la búsqueda es abierta.

Para alcanzar 100 nuevos con 30 duplicados, el Finder debe continuar buscando hasta insertar 100 nuevos o agotar las queries/candidatos. No debe finalizar al evaluar solo 100 candidatos.

## Modelo de Lead futuro

Finder debería escribir solo datos descubiertos:

- `business_name` ← nombre;
- `category` ← categoría solicitada o categoría normalizada explícitamente;
- `subcategory` ← solo si existe una regla confiable;
- `website` ← URL encontrada;
- `domain` ← dominio normalizado por el backend;
- `city`, `province_state`, `country` ← parseados de la ubicación/query, con validación;
- `address` ← dirección;
- `google_maps_url` ← URL canónica;
- `source = 'google_maps'`;
- `source_reference` ← `place_id` si está disponible, o una referencia estable definida por el backend;
- `phone` ← solo si Google lo devolvió de forma explícita.

Email, redes, contacto, score, oferta, demo y notas deben quedar nulos o pendientes hasta Enricher/Scoring.

## Dedupe futuro contra `leads`

Orden recomendado antes de consumir un cupo:

1. dominio normalizado no vacío;
2. email de contacto no vacío;
3. `google_maps_url` normalizada;
4. `source_reference`/place ID;
5. nombre normalizado + ciudad/dirección como fallback.

La decisión final debe estar en D1 con filtros por `organization_id` y una inserción atómica. El Finder puede prefiltrar, pero no debe ser la única barrera contra carreras o duplicados.

## Rate limiting responsable

Mantener una sola sesión/concurrencia baja, delays entre búsquedas y backoff ante fallos transitorios. Detectar explícitamente 429, CAPTCHA, consentimiento inesperado y cambios de UI; pausar el Job o marcarlo para retry, no insistir agresivamente. Registrar métricas sin almacenar cookies ni credenciales.

## Plan Etapa 3B

1. Congelar el contrato `FinderCandidate` independiente de Excel.
2. Crear un adaptador de lectura/escritura de prueba que no toque producción.
3. Separar el core de descubrimiento de la UI interactiva y del Excel.
4. Definir el contrato firmado `jobId + parámetros + continuation` entre Worker y servicio externo.
5. Implementar solo un endpoint interno de `dry-run` que devuelva candidatos sin crear Leads.
6. Probar con una organización/fixture aislada y una sola categoría/localidad.
7. Medir candidatos por minuto, duplicados, errores, bloqueos y cancelación.
8. Recién después diseñar 3C: persistencia de candidatos nuevos en D1 mediante deduplicación atómica.

No se recomienda integrar ni desplegar Finder real hasta completar ese contrato y las pruebas aisladas.
