/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { defaultProduct3DConfig, product3DConfigIssues, parseProduct3DConfig, PRODUCT_3D_LIMITS } from '@corsteno/types';
import { getProduct3D } from '../src/services/product-3d';
import { MAX_MODEL_ASSET_BYTES, validateGlbFile } from '../src/services/assets';

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
