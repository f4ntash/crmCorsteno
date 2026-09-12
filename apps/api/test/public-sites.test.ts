/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

const siteKey = 'site_demo1234';
const mainAsset = 'asset-main';
const galleryAsset = 'asset-gallery';
const modelAsset = 'asset-model';

function fixture(options: { siteStatus?: string; publishedContent?: string | null; includeProduct?: boolean } = {}) {
  const site = { id: 'channel-a', organizationId: 'org-a', publicKey: siteKey, name: 'Lumbre Norte Web', type: 'external_site', status: options.siteStatus ?? 'active', url: 'https://shop.example', updatedAt: 10 };
  const content = options.publishedContent === undefined ? JSON.stringify({
    hero: { title: 'Lumbre Norte', description: 'Una colección de luz.', image: `/assets/organizations/org-a/assets/${mainAsset}.png`, ctaLabel: 'Conocer más', ctaUrl: 'https://shop.example/contacto' },
    promotion: { enabled: true, title: 'Nueva temporada', description: 'Descubrí la colección.', image: null, ctaLabel: 'Ver productos', ctaUrl: 'https://shop.example/productos' },
  }) : options.publishedContent;
  const product = {
    productId: 'product-a', productKey: 'lumbre-nido', name: 'Lámpara Nido', description: 'Luz cálida.', priceMinorUnits: 125000, currency: 'ARS', stock: 3,
    publishedContent: JSON.stringify({ name: 'Lámpara Nido', description: 'Luz cálida.', priceMinorUnits: 125000, currency: 'ARS', stock: 3, mainAssetUrl: `/assets/organizations/org-a/assets/${mainAsset}.png`, ctaLabel: 'Consultar', ctaUrl: 'https://shop.example/contacto' }),
    mainAssetUrl: `/assets/organizations/org-a/assets/${mainAsset}.png`, ctaLabel: 'Consultar', ctaUrl: 'https://shop.example/contacto', sortOrder: 0, visible: 1, status: 'active', updatedAt: 12, publishedAt: 12,
  };
  const products = options.includeProduct === false ? [] : [product];
  const assets = [
    { id: mainAsset, storageKey: `organizations/org-a/assets/${mainAsset}.png`, mimeType: 'image/png', category: 'image', archivedAt: null },
    { id: galleryAsset, storageKey: `organizations/org-a/assets/${galleryAsset}.webp`, mimeType: 'image/webp', category: 'image', archivedAt: null },
    { id: modelAsset, storageKey: `organizations/org-a/assets/${modelAsset}.glb`, mimeType: 'model/gltf-binary', category: 'model-3d', archivedAt: null },
  ];
  const gallery = [{ productId: 'product-a', assetUrl: `http://localhost/assets/organizations/org-a/assets/${galleryAsset}.webp`, sortOrder: 0 }];
  const model = { productId: 'product-a', publishedConfig: JSON.stringify({ schemaVersion: 1, transform: { scale: 1, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 180, z: 0 } }, viewer: { framing: 'auto' }, arEnabled: true }), publishedModelAssetId: modelAsset, updatedAt: 13, publishedAt: 13 };

  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          const statement: any = { __sql: sql, __args: args };
          statement.first = async () => {
            if (sql.includes("sqlite_master") && sql.includes("channel_products")) return { name: 'channel_products' };
            if (sql.includes('FROM channels WHERE public_key=?')) return args[0] === siteKey && site.status === 'active' ? site : null;
            if (sql.includes('FROM channel_content') && sql.includes('WHERE channel_id=?')) return { profileKey: 'marketing-basic-v1', profileVersion: 1, publishedContent: content, publishedAt: content ? 11 : null, updatedAt: 11 };
            if (sql.includes('FROM organization_assets') && sql.includes('WHERE id=?')) return assets.find((asset) => asset.id === args[0] && asset.storageKey && args[1] === 'org-a') ?? null;
            if (sql.includes('channel_content') && sql.includes('published_content LIKE')) return content && String(args.at(-1)).includes(mainAsset) ? { value: 1 } : null;
            if (sql.includes('channel_published_products') && sql.includes('published_content LIKE')) return products.length && String(args.at(-1)).includes(mainAsset) ? { value: 1 } : null;
            if (sql.includes('product_published_images') && sql.includes('asset_url LIKE')) return gallery.length && String(args.at(-1)).includes(galleryAsset) ? { value: 1 } : null;
            if (sql.includes('product_3d_config') && sql.includes('published_model_asset_id=?')) return modelAsset === args.at(-1) && products.length ? { value: 1 } : null;
            return null;
          };
          statement.all = async () => {
            if (sql.includes("sqlite_master") && sql.includes("channel_products")) return { results: [{ name: 'channel_products' }] };
            if (sql.includes('FROM channel_published_products cp JOIN products')) return { results: products };
            if (sql.includes('FROM organization_assets') && sql.includes('id IN')) return { results: assets.filter((asset) => args.slice(1).includes(asset.id)) };
            if (sql.includes('FROM product_published_images')) return { results: gallery };
            if (sql.includes('FROM product_3d_config')) return { results: products.length ? [model] : [] };
            return { results: [] };
          };
          statement.run = async () => ({ success: true, meta: { changes: 1 } });
          return statement;
        },
      };
    },
  };
  const objects = new Map<string, string>([
    [assets[0]!.storageKey, 'png'],
    [assets[1]!.storageKey, 'webp'],
    [assets[2]!.storageKey, 'glb'],
  ]);
  const EXPERIENCE_ASSETS = { async get(key: string) { const value = objects.get(key); if (!value) return null; return { body: new Response(value).body, httpEtag: `etag-${value}`, writeHttpMetadata(headers: Headers) { headers.set('content-type', value === 'glb' ? 'model/gltf-binary' : `image/${value}`); } }; } };
  return { DB, EXPERIENCE_ASSETS, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://api.local${path}`, { ...init, headers: { Accept: 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('public site API v1', () => {
  it('returns only active published site content/products with the stable contract', async () => {
    const response = await request(`/public/v1/sites/${siteKey}`, fixture());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=30');
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      site: { key: siteKey, name: 'Lumbre Norte Web' },
      content: expect.objectContaining({ profile: 'marketing-basic-v1', sections: expect.objectContaining({ hero: expect.objectContaining({ title: 'Lumbre Norte', image: { url: `http://api.local/public/v1/sites/${siteKey}/assets/${mainAsset}` } }) }) }),
      products: [expect.objectContaining({ key: 'lumbre-nido', name: 'Lámpara Nido', images: { main: { url: `http://api.local/public/v1/sites/${siteKey}/assets/${mainAsset}` }, gallery: [{ url: `http://api.local/public/v1/sites/${siteKey}/assets/${galleryAsset}` }] }, model3d: expect.objectContaining({ available: true, modelUrl: `http://api.local/public/v1/sites/${siteKey}/assets/${modelAsset}` }) })],
    });
  });

  it('returns stable null content when no published snapshot exists and safely 404s invalid/inactive sites', async () => {
    const noContent = await request(`/public/v1/sites/${siteKey}/content`, fixture({ publishedContent: null }));
    expect(noContent.status).toBe(200);
    expect((await noContent.json() as { content: unknown }).content).toBeNull();
    expect((await request('/public/v1/sites/not-a-site', fixture())).status).toBe(404);
    expect((await request(`/public/v1/sites/${siteKey}`, fixture({ siteStatus: 'inactive' }))).status).toBe(404);
  });

  it('excludes unpublished/absent products and protects direct product lookup', async () => {
    const response = await request(`/public/v1/sites/${siteKey}/products`, fixture({ includeProduct: false }));
    expect(response.status).toBe(200);
    expect((await response.json() as { products: unknown[] }).products).toEqual([]);
    expect((await request(`/public/v1/sites/${siteKey}/products/unknown`, fixture())).status).toBe(404);
  });

  it('serves only referenced image/model assets without CRM authentication', async () => {
    const env = fixture();
    const image = await request(`/public/v1/sites/${siteKey}/assets/${mainAsset}`, env);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toContain('immutable');
    const head = await request(`/public/v1/sites/${siteKey}/assets/${mainAsset}`, env, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect((await request(`/public/v1/sites/${siteKey}/assets/not-referenced`, env)).status).toBe(404);
    expect((await request(`/public/v1/sites/${siteKey}/assets/${modelAsset}`, env)).status).toBe(200);
  });

  it('allows a registered site origin without CRM credentials and supports ETag revalidation', async () => {
    const env = fixture();
    const first = await request(`/public/v1/sites/${siteKey}/products`, env, { headers: { Origin: 'https://shop.example' } });
    expect(first.headers.get('access-control-allow-origin')).toBe('https://shop.example');
    expect(first.headers.get('access-control-allow-credentials')).toBeNull();
    const etag = first.headers.get('etag');
    const second = await request(`/public/v1/sites/${siteKey}/products`, env, { headers: { 'If-None-Match': etag ?? '' } });
    expect(second.status).toBe(304);
  });
});
