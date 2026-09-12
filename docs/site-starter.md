# Corsteno Site Starter

STEP 7 provides a small, standalone Vite/React customer-site starter. It is
not a hosted Corsteno runtime and it is not a visual page builder.

## Create a client site

From the Corsteno repository:

```bash
pnpm create:site -- \
  --name "Cliente" \
  --slug "cliente" \
  --site-key "site_..." \
  --api-url "http://localhost:8787" \
  --out "../cliente"
```

If an argument is omitted, the command asks for it interactively. The slug is
a safe project-directory slug, the Site Key must use the public `site_...`
format, API URLs must be HTTP(S), and an existing non-empty destination is
never overwritten.

The generated project can then run independently:

```bash
cd ../cliente
pnpm install
pnpm dev
```

## Responsibility split

| Owner | Responsibility |
| --- | --- |
| Customer in Corsteno | Published hero/promotion content, products, prices, stock, images and CTAs |
| Developer in the site project | Layout, typography, routes, React composition, CSS and code-owned brand fallback |
| Corsteno 3D operator | GLB selection/upload, viewer transform and 3D publication |

The starter reads only the versioned STEP 6 public API. It does not request
CRM sessions, drafts, admin data or private assets. The Site Key and API URL
are public configuration values. The private workspace SDK is packaged into
`vendor/corsteno-client.tgz`, so the generated project does not use a
`workspace:*` dependency or a symlink into this repository.

## Publishing behavior

Published content, Product data, site Product order/visibility and Product 3D
are fetched at runtime. Publishing in Corsteno followed by a browser refresh
updates the site without rebuilding it. The public API's normal cache and ETag
behavior remains in control; the starter does not add an indefinite cache.

## Hosting and current limits

The output is a static SPA for Cloudflare Pages, Netlify or an equivalent
static host. `public/_redirects` documents the SPA fallback needed for direct
Product detail links. Dynamic content is client-rendered in this first Vite
starter, so advanced server-rendered SEO is a future starter concern.

STEP 7 intentionally does not include a visual page builder, navigation CMS,
checkout, cart, orders, payments, AR, deployment automation or a hosted
runtime delivery-channel change.
