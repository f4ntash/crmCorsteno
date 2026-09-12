import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../index';
import { findPublicSite, loadPublicSite, publicAsset, validPublicSiteKey } from '../services/public-site';

export const publicSiteRoutes = new Hono<{ Bindings: Env }>();
type PublicContext = Context<{ Bindings: Env }>;

const CACHE_CONTROL = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300';

function notFound(c: PublicContext) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio no encontrado.' } }, 404);
}

function cache(c: PublicContext, version: string) {
  const etag = `"${version.replace(/[^A-Za-z0-9_.-]/g, '-')}"`;
  c.header('Cache-Control', CACHE_CONTROL);
  c.header('ETag', etag);
  return c.req.header('If-None-Match') === etag;
}

async function siteBundle(c: PublicContext) {
  const siteKey = c.req.param('siteKey');
  if (typeof siteKey !== 'string' || !validPublicSiteKey(siteKey)) return notFound(c);
  const site = await findPublicSite(c.env.DB, siteKey);
  if (!site) return notFound(c);
  const bundle = await loadPublicSite(c.env.DB, site, new URL(c.req.url).origin);
  if (cache(c, bundle.version)) return c.body(null, 304);
  return c.json({ schemaVersion: bundle.schemaVersion, site: bundle.site, content: bundle.content, products: bundle.products });
}

publicSiteRoutes.get('/v1/sites/:siteKey', siteBundle);

publicSiteRoutes.get('/v1/sites/:siteKey/content', async (c) => {
  const siteKey = c.req.param('siteKey');
  if (!validPublicSiteKey(siteKey)) return notFound(c);
  const site = await findPublicSite(c.env.DB, siteKey);
  if (!site) return notFound(c);
  const bundle = await loadPublicSite(c.env.DB, site, new URL(c.req.url).origin);
  if (cache(c, `${bundle.version}-content`)) return c.body(null, 304);
  return c.json({ schemaVersion: bundle.schemaVersion, site: bundle.site, content: bundle.content });
});

publicSiteRoutes.get('/v1/sites/:siteKey/products', async (c) => {
  const siteKey = c.req.param('siteKey');
  if (!validPublicSiteKey(siteKey)) return notFound(c);
  const site = await findPublicSite(c.env.DB, siteKey);
  if (!site) return notFound(c);
  const bundle = await loadPublicSite(c.env.DB, site, new URL(c.req.url).origin);
  if (cache(c, `${bundle.version}-products`)) return c.body(null, 304);
  return c.json({ schemaVersion: bundle.schemaVersion, site: bundle.site, products: bundle.products });
});

publicSiteRoutes.get('/v1/sites/:siteKey/products/:productKey', async (c) => {
  const siteKey = c.req.param('siteKey');
  if (!validPublicSiteKey(siteKey)) return notFound(c);
  const site = await findPublicSite(c.env.DB, siteKey);
  if (!site) return notFound(c);
  const bundle = await loadPublicSite(c.env.DB, site, new URL(c.req.url).origin);
  const product = bundle.products.find((item) => item.key === c.req.param('productKey'));
  if (!product) return notFound(c);
  if (cache(c, `${bundle.version}-${product.key}`)) return c.body(null, 304);
  return c.json({ schemaVersion: bundle.schemaVersion, site: bundle.site, product });
});

publicSiteRoutes.on(['GET', 'HEAD'], '/v1/sites/:siteKey/assets/:assetId', async (c) => {
  const resolved = await publicAsset(c.env.DB, c.req.param('siteKey'), c.req.param('assetId'));
  if (!resolved) return notFound(c);
  const object = await c.env.EXPERIENCE_ASSETS?.get(resolved.storageKey);
  if (!object) return notFound(c);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', resolved.mimeType);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(c.req.method === 'HEAD' ? null : object.body, { headers });
});
