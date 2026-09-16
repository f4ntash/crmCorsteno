import { describe, expect, it } from 'vitest';
import app from '../src';
import { cloneCatalogProducts, publishCatalogSnapshot } from '../src/services/product-catalog';
import { productCatalogExperienceType } from '../src/services/experience-types';
import { publicExperienceRegistry, type PublicExperienceAdapterContext } from '../src/services/public-experience-types';

const assetA = '11111111-1111-4111-8111-111111111111';
const assetB = '22222222-2222-4222-8222-222222222222';
const assetUrl = (organizationId: string, id: string) => `/assets/organizations/${organizationId}/assets/${id}.png`;

type Product = Record<string, unknown>;
type Image = Record<string, unknown>;

function fakeDb(role = 'admin') {
  const products: Product[] = [
    { id: 'p1', organizationId: 'org-a', experienceId: 'catalog-1', name: 'Primero', description: '', priceMinorUnits: 100, currency: 'ARS', stock: 4, sortOrder: 0, visible: 1, mainAssetUrl: null, ctaLabel: null, ctaUrl: null, createdAt: 1, updatedAt: 1 },
    { id: 'p2', organizationId: 'org-a', experienceId: 'catalog-1', name: 'Segundo', description: '', priceMinorUnits: 200, currency: 'ARS', stock: 2, sortOrder: 1, visible: 1, mainAssetUrl: null, ctaLabel: null, ctaUrl: null, createdAt: 2, updatedAt: 2 },
  ];
  const images: Image[] = [{ id: 'image-1', organizationId: 'org-a', experienceId: 'catalog-1', productId: 'p1', assetId: assetA, sortOrder: 0, createdAt: 3 }];
  const assets = new Map([[assetA, { id: assetA, storageKey: `organizations/org-a/assets/${assetA}.png`, mimeType: 'image/png' }], [assetB, { id: assetB, storageKey: `organizations/org-a/assets/${assetB}.png`, mimeType: 'image/png' }]]);
  const publishedProducts: Product[] = [];
  const publishedImages: Product[] = [];
  const activities: Product[] = [];

  function statement(sql: string, args: unknown[]) {
    return {
      __sql: sql,
      __args: args,
      async first<T>() {
        if (sql.includes('FROM auth_sessions')) return { session_id: 'session', id: 'user-a', email: 'admin@example.com', name: 'Admin', platformRole: 'user', expires_at: Date.now() + 60_000 } as T;
        if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role } as T;
        if (sql.includes('SELECT id,name,type FROM experiences')) return args[0] === 'catalog-1' || args[0] === 'catalog-2' ? { id: args[0], name: 'Catálogo', type: 'product-catalog' } as T : null;
        if (sql.includes('MAX(published_at)')) return (publishedProducts.length ? { publishedAt: 10 } : { publishedAt: null }) as T;
        if (sql.includes('COALESCE(MAX(sort_order)') && sql.includes('catalog_products')) return { sortOrder: Math.max(-1, ...products.filter((row) => row.experienceId === args[0] && row.organizationId === args[1]).map((row) => Number(row.sortOrder))) + 1 } as T;
        if (sql.includes('COUNT(*) count FROM catalog_product_images')) return { count: images.filter((row) => row.productId === args[0] && row.experienceId === args[1] && row.organizationId === args[2]).length } as T;
        if (sql.includes('COALESCE(MAX(sort_order)') && sql.includes('catalog_product_images')) return { sortOrder: Math.max(-1, ...images.filter((row) => row.productId === args[0]).map((row) => Number(row.sortOrder))) + 1 } as T;
        if (sql.includes('SELECT id FROM catalog_product_images') && sql.includes('asset_id')) return images.find((row) => row.productId === args[0] && row.assetId === args[1] && row.experienceId === args[2] && row.organizationId === args[3]) as T ?? null;
        if (sql.includes('SELECT id FROM catalog_product_images')) return images.find((row) => row.id === args[0] && row.productId === args[1] && row.experienceId === args[2] && row.organizationId === args[3]) as T ?? null;
        if (sql.includes('FROM organization_assets')) return assets.get(String(args[0])) as T ?? null;
        if (sql.includes('FROM catalog_products') && sql.includes('WHERE id=?')) return products.find((row) => row.id === args[0] && row.experienceId === args[1] && row.organizationId === args[2] && (!sql.includes('archived_at IS NULL') || !row.archivedAt)) as T ?? null;
        return null;
      },
      async all<T>() {
        if (sql.includes('FROM catalog_published_product_images')) return { results: publishedImages.filter((row) => row.experienceId === args[0] && row.organizationId === args[1]).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)) as T[] };
        if (sql.includes('FROM catalog_published_products')) return { results: publishedProducts.filter((row) => row.experienceId === args[0] && row.organizationId === args[1]).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)) as T[] };
        if (sql.includes('FROM catalog_product_images')) {
          const selected = images.filter((row) => row.experienceId === args[0] || row.experienceId === args[1]);
          if (sql.includes('JOIN organization_assets')) return { results: selected.map((row) => ({ ...row, storageKey: assets.get(String(row.assetId))?.storageKey })) as T[] };
          return { results: selected as T[] };
        }
        if (sql.includes('FROM catalog_products')) return { results: products.filter((row) => row.experienceId === args[0] && row.organizationId === args[1] && (!sql.includes('archived_at IS NULL') || !row.archivedAt)).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || String(a.id).localeCompare(String(b.id))) as T[] };
        return { results: [] as T[] };
      },
      async run() {
        if (sql.startsWith('INSERT INTO catalog_products')) {
          products.push({ id: args[0], organizationId: args[1], experienceId: args[2], name: args[3], description: args[4], priceMinorUnits: args[5], currency: args[6], priceUnit: args[7], metadata: args[8], stock: args[9], sortOrder: args[10], visible: args[11], mainAssetUrl: args[12], ctaLabel: args[13], ctaUrl: args[14], createdAt: args[15], updatedAt: args[16] });
        } else if (sql.startsWith('INSERT INTO catalog_product_images')) {
          images.push({ id: args[0], organizationId: args[1], experienceId: args[2], productId: args[3], assetId: args[4], sortOrder: args[5], createdAt: args[6] });
        } else if (sql.startsWith('UPDATE catalog_products SET sort_order')) {
          const row = products.find((item) => item.id === args[2]); if (row) row.sortOrder = args[0];
        } else if (sql.startsWith('UPDATE catalog_product_images SET sort_order')) {
          const row = images.find((item) => item.id === args[1]); if (row) row.sortOrder = args[0];
        } else if (sql.startsWith('UPDATE catalog_products SET updated_at')) {
          const row = products.find((item) => item.id === args[1]); if (row) row.updatedAt = args[0];
        } else if (sql.startsWith('DELETE FROM catalog_product_images')) {
          const index = images.findIndex((item) => item.id === args[0]); if (index >= 0) images.splice(index, 1);
        } else if (sql.startsWith('DELETE FROM catalog_published_product_images')) {
          publishedImages.splice(0, publishedImages.length);
        } else if (sql.startsWith('DELETE FROM catalog_published_products')) {
          publishedProducts.splice(0, publishedProducts.length);
        } else if (sql.startsWith('INSERT INTO catalog_published_products')) {
          publishedProducts.push({ id: args[0], organizationId: args[1], experienceId: args[2], sourceProductId: args[3], name: args[4], description: args[5], priceMinorUnits: args[6], currency: args[7], priceUnit: args[8], metadata: args[9], stock: args[10], sortOrder: args[11], mainImageUrl: args[12], ctaLabel: args[13], ctaUrl: args[14], publishedAt: args[15] });
        } else if (sql.startsWith('INSERT INTO catalog_published_product_images')) {
          publishedImages.push({ id: args[0], organizationId: args[1], experienceId: args[2], publishedProductId: args[3], sourceImageId: args[4], assetUrl: args[5], sortOrder: args[6], publishedAt: args[7] });
        } else if (sql.startsWith('INSERT INTO organization_activity')) {
          activities.push({ action: args[3], metadata: args[6] });
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
  }

  const db = {
    prepare(sql: string) { return { bind(...args: unknown[]) { return statement(sql, args); } }; },
    batch(statements: Array<{ run: () => Promise<unknown> }>) { return Promise.all(statements.map((item) => item.run())); },
  } as unknown as D1Database;
  return { db, products, images, publishedProducts, publishedImages, activities };
}

function request(path: string, env: { DB: D1Database }, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=test', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...init.headers } }), env as never);
}

describe('catalog product galleries and ordering', () => {
  it('lists stored order, reorders products, adds/reorders/removes images, and enforces scope', async () => {
    const fixture = fakeDb();
    const listed = await request('/experiences/catalog-1/catalog-products', { DB: fixture.db });
    const listedItems = (await listed.json() as { items: Product[] }).items;
    expect(listedItems.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect((listedItems[0]?.gallery as Image[])[0]).toEqual(expect.objectContaining({ assetId: assetA }));

    const reordered = await request('/experiences/catalog-1/catalog-products/reorder', { DB: fixture.db }, { method: 'POST', body: JSON.stringify({ productIds: ['p2', 'p1'] }) });
    expect(reordered.status).toBe(200);
    expect(fixture.products.filter((row) => row.experienceId === 'catalog-1').sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map((row) => row.id)).toEqual(['p2', 'p1']);

    const added = await request('/experiences/catalog-1/catalog-products/p1/images', { DB: fixture.db }, { method: 'POST', body: JSON.stringify({ assetUrl: assetUrl('org-a', assetB) }) });
    expect(added.status).toBe(201);
    expect(fixture.images).toHaveLength(2);
    const imageIds = fixture.images.map((row) => String(row.id)).reverse();
    expect((await request('/experiences/catalog-1/catalog-products/p1/images/reorder', { DB: fixture.db }, { method: 'POST', body: JSON.stringify({ imageIds }) })).status).toBe(200);
    expect(fixture.images.find((row) => row.id === imageIds[0])?.sortOrder).toBe(0);
    expect((await request(`/experiences/catalog-1/catalog-products/p1/images/${imageIds[1]}`, { DB: fixture.db }, { method: 'DELETE' })).status).toBe(200);
    expect(fixture.images).toHaveLength(1);
    expect((await request('/experiences/catalog-1/catalog-products/p1/images', { DB: fixture.db }, { method: 'POST', body: JSON.stringify({ assetUrl: assetUrl('org-b', assetA) }) })).status).toBe(400);
    expect((await request('/experiences/catalog-1/catalog-products/p2/images', { DB: fakeDb('viewer').db }, { method: 'POST', body: JSON.stringify({ assetUrl: assetUrl('org-a', assetA) }) })).status).toBe(403);
  });

  it('publishes product and gallery order into a separate snapshot', async () => {
    const fixture = fakeDb();
    await publishCatalogSnapshot(fixture.db, 'catalog-1', 'org-a', 'https://api.example');
    expect(fixture.publishedProducts.map((row) => row.sourceProductId)).toEqual(['p1', 'p2']);
    expect(fixture.publishedProducts.every((row) => typeof row.sortOrder === 'number')).toBe(true);
    expect(fixture.publishedImages).toHaveLength(1);
    expect(fixture.publishedImages[0]?.assetUrl).toBe(`https://api.example${assetUrl('org-a', assetA)}`);
    fixture.images.push({ id: 'image-2', organizationId: 'org-a', experienceId: 'catalog-1', productId: 'p1', assetId: assetB, sortOrder: 1, createdAt: 4 });
    expect(fixture.publishedImages).toHaveLength(1);
    const adapter = publicExperienceRegistry.get('product-catalog');
    const context: PublicExperienceAdapterContext = { db: fixture.db, experience: { id: 'catalog-1', organizationId: 'org-a', name: 'Catálogo', type: 'product-catalog', publishedConfig: JSON.stringify(productCatalogExperienceType.createDraftConfig()), startsAt: null, endsAt: null }, featureEntitlements: { features: [], maxActiveExperiences: 0 }, deviceId: null, sessionId: null };
    const payload = await adapter?.buildPublicPayload(context);
    expect(payload).toEqual(expect.objectContaining({ kind: 'ready', payload: expect.objectContaining({ products: expect.arrayContaining([expect.objectContaining({ name: 'Primero', gallery: [expect.stringContaining('/assets/organizations/org-a/assets/11111111')] })]) }) }));
    fixture.products.find((row) => row.id === 'p1')!.sortOrder = 1;
    fixture.products.find((row) => row.id === 'p2')!.sortOrder = 0;
    await publishCatalogSnapshot(fixture.db, 'catalog-1', 'org-a', 'https://api.example');
    expect(fixture.publishedProducts.map((row) => row.sourceProductId)).toEqual(['p2', 'p1']);
    expect(fixture.publishedImages).toHaveLength(2);
  });

  it('clones relative product and gallery order without reusing product ids', async () => {
    const fixture = fakeDb();
    await cloneCatalogProducts(fixture.db, 'catalog-1', 'org-a', 'catalog-2');
    const cloned = fixture.products.filter((row) => row.experienceId === 'catalog-2').sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
    expect(cloned.map((row) => row.name)).toEqual(['Primero', 'Segundo']);
    expect(cloned.every((row) => row.id !== 'p1' && row.id !== 'p2')).toBe(true);
    expect(fixture.images.some((row) => row.experienceId === 'catalog-2' && row.assetId === assetA)).toBe(true);
  });
});
