/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { defaultProduct3DConfig, product3DConfigIssues, parseProduct3DConfig, PRODUCT_3D_LIMITS, productSurfaceConfigIssues, isProductSurfaceConfig } from '@corsteno/types';
import { getProduct3D } from '../src/services/product-3d';
import { MAX_MODEL_ASSET_BYTES, validateGlbFile, validateSurfaceMaterialMapFile } from '../src/services/assets';
import { productSurfaceConfigIssuesForDb, publicSurfaceConfig } from '../src/services/product-surface';

function glbFile(name = 'model.glb', type = 'model/gltf-binary', json = '{"asset":{"version":"2.0"}}') {
  const jsonBytes = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const bytes = new Uint8Array(20 + jsonBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  return new File([bytes], name, { type });
}

function request(path: string, env: any, init: RequestInit = {}) {
  const headers = new Headers({ Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) });
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
}

function authDb(platformRole: string, role: string) {
  const product = { id: 'product-a', organizationId: 'org-a', productKey: 'product-a', name: 'Nido', description: '', priceMinorUnits: 1, currency: 'ARS', stock: 1, mainAssetUrl: null, ctaLabel: null, ctaUrl: null, status: 'active', publishedContent: null, publishedAt: null, createdAt: 1, updatedAt: 1, archivedAt: null };
  const db: any = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user', email: 'user@example.com', name: 'User', platformRole, expires_at: Date.now() + 60000 } as T;
              if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' } as T;
              if (sql.includes('FROM experiences') && sql.includes('type=?')) return { id: 'catalog-1' } as T;
              if (sql.includes('JOIN memberships m ON')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role } as T;
              if (sql.includes('FROM products p')) return product as T;
              if (sql.includes('FROM product_3d_config c')) return null as T;
              return null as T;
            },
            async all<T>() { return { results: [] as T[] }; },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

describe('product 3D shared validation', () => {
  it('accepts a version 2 GLB and rejects malformed, wrong type and oversized files', async () => {
    await expect(validateGlbFile(glbFile())).resolves.toMatchObject({ ok: true, mimeType: 'model/gltf-binary' });
    await expect(validateGlbFile(new File(['not a model'], 'model.glb', { type: 'model/gltf-binary' }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(validateGlbFile(glbFile('model.gltf'))).resolves.toMatchObject({ ok: false, status: 415 });
    const oversized = new File([new Uint8Array(MAX_MODEL_ASSET_BYTES + 1)], 'model.glb', { type: 'model/gltf-binary' });
    await expect(validateGlbFile(oversized)).resolves.toMatchObject({ ok: false, status: 413 });
  });

  it('keeps transforms explicit and bounded without coercing invalid values', () => {
    const config = defaultProduct3DConfig();
    expect(product3DConfigIssues(config)).toEqual([]);
    expect(parseProduct3DConfig(JSON.stringify(config))).toEqual(config);
    expect(product3DConfigIssues({ ...config, transform: { ...config.transform, scale: '1' } })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PRODUCT_3D_SCALE_INVALID' })]));
    expect(product3DConfigIssues({ ...config, transform: { ...config.transform, scale: PRODUCT_3D_LIMITS.scaleMax + 1 } })).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'config.transform.scale' })]));
  });
});

describe('product surface material capability', () => {
  const config = {
    schemaVersion: 1 as const,
    enabled: true,
    mode: 'texture' as const,
    physicalWidthM: 0.6,
    physicalHeightM: 1.2,
    rotationDegrees: 0,
    orientation: 'vertical' as const,
    compatibleSurfaces: ['wall', 'floor'] as ('wall' | 'floor')[],
    roughness: 0.7,
    metalness: 0,
    normalScale: 0.45,
    fallbackColor: '#d7d1c6',
    assets: { baseColorAssetId: 'asset-base', normalAssetId: 'asset-normal', roughnessAssetId: 'asset-rough' },
  };

  it('validates persisted configs with asset IDs and rejects arbitrary public URLs', () => {
    expect(productSurfaceConfigIssues(config)).toEqual([]);
    expect(isProductSurfaceConfig(config)).toBe(true);
    expect(productSurfaceConfigIssues({ ...config, mode: 'solid', baseColor: '#d7d1c6', assets: undefined, normalScale: undefined })).toEqual([]);
    expect(productSurfaceConfigIssues({ ...config, assets: { baseColorAssetId: config.assets.baseColorAssetId } })).toEqual([]);
    expect(productSurfaceConfigIssues({ ...config, assets: { ...config.assets, baseColorAssetId: 'https://evil.example/map.webp' } })).toContain('config.assets.baseColorAssetId');
    expect(productSurfaceConfigIssues({ ...config, compatibleSurfaces: [] })).toContain('config.compatibleSurfaces');
    expect(productSurfaceConfigIssues({ ...config, roughness: Number.NaN })).toContain('config.roughness');
    expect(productSurfaceConfigIssues({ ...config, physicalWidthM: -1 })).toContain('config.physicalWidthM');
  });

  it('sanitizes published output to public URLs and never exposes asset IDs', () => {
    const publicConfig = publicSurfaceConfig(config, {
      baseColor: { storageKey: 'organizations/org-a/assets/asset-base.webp' },
      normal: { storageKey: 'organizations/org-a/assets/asset-normal.webp' },
      roughness: { storageKey: 'organizations/org-a/assets/asset-rough.webp' },
    }, 'https://api.example.com');
    expect(publicConfig).toMatchObject({ mode: 'texture', assets: { baseColorTexture: 'https://api.example.com/assets/organizations/org-a/assets/asset-base.webp' } });
    expect(publicConfig && 'assets' in publicConfig && 'baseColorAssetId' in publicConfig.assets).toBe(false);
    expect(publicSurfaceConfig(config, { baseColor: null, normal: null, roughness: null }, 'https://api.example.com')).toMatchObject({ mode: 'solid', baseColor: '#d7d1c6', demoPlaceholder: true });
    expect(publicSurfaceConfig({ ...config, enabled: false }, { baseColor: null, normal: null, roughness: null }, 'https://api.example.com')).toBeNull();
  });

  it('accepts only valid WebP PBR map signatures', async () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    await expect(validateSurfaceMaterialMapFile(new File([webp], 'base.webp', { type: 'image/webp' }))).resolves.toMatchObject({ ok: true, mimeType: 'image/webp' });
    await expect(validateSurfaceMaterialMapFile(new File(['not webp'], 'base.webp', { type: 'image/webp' }))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(validateSurfaceMaterialMapFile(new File([webp], 'base.png', { type: 'image/png' }))).resolves.toMatchObject({ ok: false, status: 415 });
  });

  it('keeps asset references tenant-scoped', async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async all<T>() {
                return { results: [] as T[] };
              },
              async first<T>() {
                return (sql.includes('FROM products') ? { id: 'product-a' } : null) as T;
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const issues = await productSurfaceConfigIssuesForDb(db, 'org-a', 'product-a', { ...config, assets: { ...config.assets, baseColorAssetId: 'asset-other-org' } });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PRODUCT_SURFACE_ASSET_INVALID', path: 'draftConfig.assets.baseColorAssetId' })]));
  });
});

describe('product surface API authorization', () => {
  it('blocks customer access to the organization material configuration', async () => {
    const response = await request('/products/product-a/surface', authDb('user', 'viewer'));
    expect(response.status).toBe(403);
  });

  it('allows an organization administrator to read an empty material state', async () => {
    const operator = await request('/products/product-a/surface', authDb('user', 'admin'));
    expect(operator.status).toBe(200);
    expect(await operator.json()).toEqual(expect.objectContaining({ status: 'not_configured' }));
  });
});

describe('product 3D state and authorization', () => {
  it('returns an isolated empty state before a technical draft exists', async () => {
    const db = authDb('corsteno_admin', 'global_admin').DB as D1Database;
    await expect(getProduct3D(db, 'org-a', 'product-a', 'http://localhost')).resolves.toEqual(expect.objectContaining({ productId: 'product-a', organizationId: 'org-a', status: 'not_configured', draftConfig: null, publishedConfig: null }));
  });

  it('blocks customer access to raw 3D endpoints even when the customer can manage products', async () => {
    const response = await request('/products/product-a/3d', authDb('user', 'admin'));
    expect(response.status).toBe(403);
  });

  it('allows platform operators to access the internal 3D endpoint in a selected organization', async () => {
    const response = await request('/products/product-a/3d', authDb('corsteno_admin', 'global_admin'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ status: 'not_configured' }));
  });
});
