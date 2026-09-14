import { describe, expect, it } from 'vitest';
import { catalogProductFieldErrors, normalizeCatalogCtaUrl, parseMoneyToMinor } from '@corsteno/types';
import app from '../src';
import { productCatalogExperienceType, resolveExperienceType } from '../src/services/experience-types';
import { catalogInventoryCsv } from '../src/services/catalog-report';
import { validateProductCatalogPublishReadiness } from '../src/services/product-catalog';
import { publicExperienceRegistry, type PublicExperienceAdapterContext } from '../src/services/public-experience-types';

function request(path: string, env: { DB: D1Database }, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=test', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...init.headers } }), env as never);
}

function db(options: { role?: string; catalog?: Array<Record<string, unknown>>; productCatalogAssigned?: boolean } = {}) {
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
              if (sql.includes('FROM experiences') && sql.includes('type=?')) return options.productCatalogAssigned === false || args[0] !== 'catalog-1' ? null : { id: 'catalog-1' } as T;
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

  it('rejects the organization product API when product-catalog is not assigned', async () => {
    const response = await request('/products', { DB: db({ productCatalogAssigned: false }) });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: { code: 'PRODUCT_NOT_ASSIGNED', message: 'Este producto no está asignado a la organización.' } });
  });

  it('keeps money parsing and product field validation strict and shared', () => {
    expect(parseMoneyToMinor('12,50')).toBe(1250);
    expect(parseMoneyToMinor('12.5')).toBe(1250);
    expect(parseMoneyToMinor('12abc')).toBeNull();
    expect(parseMoneyToMinor('-12')).toBeNull();
    expect(parseMoneyToMinor('12,345')).toBeNull();
    expect(parseMoneyToMinor('1 000')).toBeNull();
    expect(parseMoneyToMinor('9'.repeat(20))).toBeNull();

    const errors = catalogProductFieldErrors({ name: '   ', description: 'ok', priceMinorUnits: '12abc', currency: 'ARS', stock: 1.5, visible: true, ctaLabel: null, ctaUrl: 'javascript:alert(1)' });
    expect(errors).toEqual(expect.objectContaining({ name: expect.any(String), priceMinorUnits: expect.any(String), stock: expect.any(String), ctaUrl: expect.any(String) }));
  });

  it('accepts WhatsApp phone numbers and normalizes them to wa.me', () => {
    expect(normalizeCatalogCtaUrl('+54 9 3541 123456')).toBe('https://wa.me/5493541123456');
    expect(catalogProductFieldErrors({ name: 'Producto', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, visible: true, ctaLabel: 'Consultar', ctaUrl: '03541 123456' }, 'whatsapp')).not.toHaveProperty('ctaUrl');
    expect(catalogProductFieldErrors({ name: 'Producto', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, visible: true, ctaLabel: 'Abrir', ctaUrl: 'https://example.com' }, 'url')).not.toHaveProperty('ctaUrl');
    expect(catalogProductFieldErrors({ name: 'Producto', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, visible: true, ctaLabel: 'Abrir', ctaUrl: 'https://example.com' }, 'whatsapp')).toHaveProperty('ctaUrl');
    expect(catalogProductFieldErrors({ name: 'Producto', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, visible: true, ctaLabel: 'Abrir', ctaUrl: '3541' }, 'whatsapp')).toHaveProperty('ctaUrl');
  });

  it('returns field-specific API issues instead of silently coercing bad product input', async () => {
    const response = await request('/experiences/catalog-1/catalog-products', { DB: db() }, { method: 'POST', body: JSON.stringify({ name: 'Producto', description: '', priceMinorUnits: '12abc', currency: 'ARS', stock: 1.5, visible: true, mainAssetUrl: null, ctaLabel: null, ctaUrl: 'javascript:alert(1)' }) });
    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: { code?: string; issues?: Array<{ code: string; path: string }> } };
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    expect(payload.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PRODUCT_PRICE_INVALID', path: 'products.priceMinorUnits' }),
      expect.objectContaining({ code: 'PRODUCT_STOCK_INVALID', path: 'products.stock' }),
      expect.objectContaining({ code: 'PRODUCT_CTA_URL_INVALID', path: 'products.ctaUrl' }),
    ]));
  });

  it('rejects a main image that is missing from the active organization asset library', async () => {
    const response = await request('/experiences/catalog-1/catalog-products', { DB: db() }, { method: 'POST', body: JSON.stringify({ name: 'Producto', description: '', priceMinorUnits: 100, currency: 'ARS', stock: 1, visible: true, mainAssetUrl: '/assets/organizations/org-a/assets/00000000-0000-4000-8000-000000000001.png', ctaLabel: null, ctaUrl: null }) });
    expect(response.status).toBe(400);
    const payload = await response.json() as { error?: { issues?: Array<{ code: string }> } };
    expect(payload.error?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PRODUCT_ASSET_INVALID' })]));
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
