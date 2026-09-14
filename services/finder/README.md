# Corsteno Finder Core — Etapa 3B

Finder local y aislado para descubrir candidatos en Google Maps. Su salida termina en `FinderCandidate[]` y no conoce D1, Hono, Cloudflare, Queues, React, Enricher, scoring ni email.

## Instalación

Requiere Python 3.11+.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r services/finder/requirements.txt
python -m playwright install chromium
```

Instalar `playwright` no instala automáticamente el ejecutable de Chromium. El segundo comando debe ejecutarse una vez por entorno. El Finder no descarga browsers durante runtime.

## Diagnóstico del runtime

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder doctor
```

El doctor verifica Python, Playwright, el ejecutable local de Chromium, launch, navegación neutra y cierre. No accede a Google Maps, CRM ni producción.

## Dry-run

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder dry-run --category inmobiliaria --location "Villa Carlos Paz, Córdoba" --limit 10
```

El modo normal es headless. Para diagnóstico visual:

```powershell
python -m finder dry-run --category inmobiliaria --location "Villa Carlos Paz, Córdoba" --limit 3 --headed
```

La ejecución está limitada a 25 candidatos y genera `tmp/finder-dry-run.jsonl`, ignorado por Git. No llama API, no escribe D1, no crea Leads y no toca Cloudflare.

## Categorías

La lista centralizada contiene únicamente las 38 categorías del Finder original. Se puede consultar desde `finder.config.SUPPORTED_CATEGORIES`.

## Arquitectura

`SearchConfig → GoogleMapsBrowser → discover() → FinderCandidate[] → JSONL/Excel opcional`

Los selectores están en `finder/selectors.py` y la interacción Playwright está encapsulada en `finder/browser.py`. El Excel es un adaptador opcional de diagnóstico; no es persistencia del core.

## Errores y bloqueos

Se distinguen navegación, selectores, timeout, parseo, navegador y `blocked`. CAPTCHA, challenges o señales de bloqueo detienen el lote actual, conservan el resumen y devuelven código de salida 2. No se implementan técnicas de evasión ni loops para vencer bloqueos.

## Tests

Los tests unitarios no requieren Internet:

```powershell
$env:PYTHONPATH = "services/finder"
python -m unittest discover -s services/finder/tests -v
```

El dry-run real de Playwright es un smoke test manual y separado. No se ejecuta como parte de la suite general.

## Runner externo — Etapa 3C

El runner procesa exactamente un mensaje de `corsteno-finder-jobs` por ejecución:

```powershell
$env:PYTHONPATH = "services/finder"
python -m finder runner pull-once
```

Requiere las variables de [`.env.example`](C:/Users/Matu/Documents/ChatGPT/crm/services/finder/.env.example). `CF_QUEUES_API_TOKEN` debe ser un token independiente con permisos de cuenta Queues read/write. `FINDER_SERVICE_SECRET` debe ser el mismo secreto provisionado en el Worker API, pero nunca se guarda en Git, Queue, D1 ni logs.

El runner usa `batch_size=1`, `visibility_timeout=120s`, ACK únicamente después de `complete`, y retry con demora de 30 segundos para fallos transitorios. Un mensaje JSON de Cloudflare llega normalmente base64-encoded; el cliente decodifica según `CF-Content-Type`.

En Etapa 3C el backend valida los candidatos y sólo guarda métricas seguras en `lead_jobs.metadata`. No inserta candidatos en `leads`.

## Limitaciones

Google Maps UI puede cambiar selectores, limitar tráfico o mostrar challenges. Esta etapa no incluye persistencia, deduplicación definitiva, organización, Jobs, Queue, API interna, enriquecimiento ni scoring. El Finder original en `C:\Users\Matu\Desktop\Corsteno\corsteno_leads_scripts` se conserva sin modificaciones.
