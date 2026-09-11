import { describe, expect, it } from 'vitest';
import app from '../src';
import { productCatalogExperienceType, resolveExperienceType } from '../src/services/experience-types';
import { catalogInventoryCsv } from '../src/services/catalog-report';
import { validateProductCatalogPublishReadiness } from '../src/services/product-catalog';
import { publicExperienceRegistry, type PublicExperienceAdapterContext } from '../src/services/public-experience-types';

function request(path: string, env: { DB: D1Database }, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=test', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...init.headers } }), env as never);
}

function db(options: { role?: string; catalog?: Array<Record<string, unknown>> } = {}) {
  const role = options.role ?? 'admin';
  const catalog = options.catalog ?? [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user-a', email: 'admin@example.com', name: 'Admin', platformRole: 'user', expires_at: Date.now() + 60_000 } as T;
              if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role } as T;
              if (sql.includes('SELECT id,name,type FROM experiences')) return args[0] === 'catalog-1' ? { id: 'catalog-1', name: 'Catálogo', type: 'product-catalog' } as T : null;
              if (sql.includes('FROM catalog_products') && sql.includes('WHERE id=?')) return catalog.find((item) => item.id === args[0]) as T ?? null;
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM catalog_products') || sql.includes('FROM catalog_published_products')) return { results: catalog.filter((item) => !sql.includes('visible=1') || Number(item.visible) === 1) as T[] };
              return { results: [] as T[] };
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('product-catalog type', () => {
  it('is a registered production type with an independent valid draft', () => {
    expect(resolveExperienceType('product-catalog')).toBe(productCatalogExperienceType);
    const draft = productCatalogExperienceType.createDraftConfig();
    expect(productCatalogExperienceType.validateDraft(draft)).toBe(true);
    expect(productCatalogExperienceType.validateDraft({ schemaVersion: 1, intro: 'x'.repeat(501) })).toBe(false);
  });

  it('requires a visible product for publication and keeps hidden products from satisfying readiness', async () => {
    const base = { id: 'p', organizationId: 'org-a', experienceId: 'catalog-1', name: 'Producto', description: '', priceMinorUnits: 100, currency: 'ARS', stock: 2, visible: 0, mainAssetUrl: null, ctaLabel: null, ctaUrl: null, createdAt: 1, updatedAt: 1 };
    await expect(validateProductCatalogPublishReadiness(db({ catalog: [base] }), 'catalog-1', 'org-a', productCatalogExperienceType.createDraftConfig())).resolves.toEqual([expect.objectContaining({ code: 'NO_VISIBLE_PRODUCTS' })]);
    await expect(validateProductCatalogPublishReadiness(db({ catalog: [{ ...base, visible: 1 }] }), 'catalog-1', 'org-a', productCatalogExperienceType.createDraftConfig())).resolves.toEqual([]);
  });

  it('scopes product CRUD to the catalog experience and CRM permission', async () => {
    const env = { DB: db() };
    const created = await request('/experiences/catalog-1/catalog-products', env, { method: 'POST', body: JSON.stringify({ name: 'Producto', description: '', priceMinorUnits: 1250, currency: 'ARS', stock: 3, visible: true, mainAssetUrl: null, ctaLabel: null, ctaUrl: null }) });
    expect(created.status).toBe(201);
    expect((await request('/experiences/wrong/catalog-products', env)).status).toBe(404);
    expect((await request('/experiences/catalog-1/catalog-products', { DB: db({ role: 'viewer' }) }, { method: 'POST', body: '{}' })).status).toBe(403);
  });
});

describe('product-catalog public adapter and report safety', () => {
  it('reads only the published representation', async () => {
    const adapter = publicExperienceRegistry.get('product-catalog');
    const context: PublicExperienceAdapterContext = { db: db({ catalog: [{ name: 'Publicado', description: '', priceMinorUnits: 100, currency: 'ARS', stock: 4, mainImageUrl: null, ctaLabel: null, ctaUrl: null }] }), experience: { id: 'catalog-1', organizationId: 'org-a', name: 'Catálogo', type: 'product-catalog', publishedConfig: JSON.stringify(productCatalogExperienceType.createDraftConfig()), startsAt: null, endsAt: null }, featureEntitlements: { features: [], maxActiveExperiences: 0 }, deviceId: null, sessionId: null };
    await expect(adapter?.buildPublicPayload(context)).resolves.toEqual(expect.objectContaining({ kind: 'ready', payload: expect.objectContaining({ type: 'product-catalog' }) }));
  });

  it('exports customer-safe inventory CSV with escaping and formula protection', () => {
    const csv = catalogInventoryCsv([{ name: '=Oferta, "especial"', priceMinorUnits: 1250, currency: 'ARS', stock: 2, visible: 1 }]);
    expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain('"\'=Oferta, ""especial"""');
    expect(csv).toContain('"producto","precio","moneda","stock","visibilidad"');
  });
});
