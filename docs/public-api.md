# Corsteno Public API

The versioned public API exposes published content and explicitly connected,
published Products for active external or Corsteno-built sites. Public data is
public: `siteKey` identifies a site and is not a browser secret.

## Site key

An authorized CRM user can copy the `siteKey` from the channel's **Integración**
section. Renaming the channel does not change it.

## SDK

```bash
pnpm add @corsteno/client
```

```ts
import { createCorstenoClient } from '@corsteno/client';

const corsteno = createCorstenoClient({
  baseUrl: 'https://api.corsteno.com',
  siteKey: 'site_…',
});

const content = await corsteno.getContent();
const products = await corsteno.getProducts();
const nido = await corsteno.getProduct('lumbre-norte-…');
```

The client uses standard `fetch`, has no React or DOM dependency, accepts an
optional `AbortSignal`, and maps not-found, invalid-request, server and network
failures to `CorstenoApiError`.

## Endpoints

```text
GET /public/v1/sites/:siteKey
GET /public/v1/sites/:siteKey/content
GET /public/v1/sites/:siteKey/products
GET /public/v1/sites/:siteKey/products/:productKey
```

Every JSON response includes `schemaVersion: 1`. Site content is
`content: null` until content has been published. Product results include only
visible Products in the channel's published association snapshot, and only
Products with published commercial data. A published Product can change its
price or stock without republishing the site structure.

Images and published Product 3D models are returned as public URLs that are
resolved only when the referenced asset is active and reachable from the
published site data. `model3d.available` is `false` when no published 3D
configuration exists. Draft content, draft Products, draft 3D configuration and
CRM metadata never cross this API.

For local development, use the API worker at `http://localhost:8787` and a
local channel `siteKey`; the development CORS allowlist includes the existing
local web origins.
