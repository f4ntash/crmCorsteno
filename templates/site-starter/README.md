# __SITE_NAME__

Standalone Vite + React + TypeScript starter connected to Corsteno's public
Site API.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer

## Install and run

```bash
pnpm install
pnpm dev
```

The generated project contains a local `.env` with its public Site Key and API
URL. To configure another site, copy `.env.example` to `.env` and set:

```text
VITE_CORSTENO_API_URL=https://api.example.com
VITE_CORSTENO_SITE_KEY=site_...
```

The Site Key is a public identifier, not a secret. This project never uses
CRM credentials or authenticated endpoints.

## Build and preview

```bash
pnpm typecheck
pnpm build
pnpm preview
```

The site is a static SPA and includes `public/_redirects` for Cloudflare Pages
and other hosts that support the Netlify-style fallback. Configure the host to
serve `index.html` for `/productos/:productKey` deep links when needed.

## What comes from Corsteno

At runtime, `@corsteno/client` reads only published public data:

- Home hero and optional promotion from `marketing-basic-v1` content
- Published, visible products and their order
- Product image galleries, price, currency, stock and CTA
- Published Product 3D model/configuration when available

Changes made in Corsteno become visible after the corresponding content,
Product or 3D publication and a browser refresh. No site rebuild is required.
Drafts, CRM metadata and private assets are never requested.

## What developers own

React composition, routes, CSS, typography, layout and this code-owned brand
fallback live in `src/`. Change those files to customize the visual design.
The dynamic values are intentionally not edited in the generated source.

## Product 3D

Corsteno operators publish the GLB and its viewer transform. The website
automatically prefers a published model, provides orbit controls, and falls
back to the product image if the model cannot load. The public `arEnabled`
metadata is preserved for a future real AR integration; this starter does not
show a non-functional AR button.

## SEO note

This first Vite starter renders live content in the browser. Static shell
metadata can be customized in `index.html`; server-rendered SEO would require
a future SSR starter.

## Cloudflare Pages basics

Create a Pages project from this directory, use `pnpm install` as the install
step and `pnpm build` as the build command, and publish `dist` as the output
directory. Add the same `VITE_CORSTENO_API_URL` and
`VITE_CORSTENO_SITE_KEY` values as build environment variables. Configure the
public API CORS origin for the site's domain.

The vendored `vendor/corsteno-client.tgz` is used so this project can install
without the Corsteno monorepo. A future registry release can replace that
file dependency without changing the site adapter.
