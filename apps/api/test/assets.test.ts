/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type Asset = { id: string; organization_id: string; storage_key: string; original_filename: string; display_name: string; mime_type: string; byte_size: number; category: string; created_by: string; created_at: number; updated_at: number; archived_at: number | null };

function fixture(options: { role?: string; platformRole?: string; assets?: Asset[]; referenced?: boolean } = {}) {
  const assets = [...(options.assets ?? [])];
  const activity: Array<Record<string, unknown>> = [];
  const objects = new Map<string, ArrayBuffer>();
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const statement: any = { __sql: sql, __args: args };
          statement.first = async () => {
            if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: options.platformRole ?? 'user', expires_at: Date.now() + 60000 };
            if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' };
            if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-a' ? { id: 'org-a', name: 'Org A', slug: 'org-a', role: options.role ?? 'member' } : null;
            if (sql.includes('FROM organization_assets')) {
              const asset = assets.find((item) => item.id === args[0] && item.organization_id === args[1] && (sql.includes('archived_at IS NULL') ? item.archived_at === null : true));
              return asset ? presentRow(asset) : null;
            }
            if (sql.includes('FROM experiences') && sql.includes('draft_config LIKE')) return options.referenced ? { id: 'experience-1' } : null;
            return null;
          };
          statement.all = async () => {
            if (!sql.includes('FROM organization_assets')) return { results: [] };
            let result = assets.filter((item) => item.organization_id === 'org-a' && item.archived_at === null);
            if (sql.includes('category=?')) result = result.filter((item) => item.category === args[1]);
            if (sql.includes('LIKE ?')) { const query = String(args[sql.includes('category=?') ? 2 : 1]).replaceAll('%', '').toLowerCase(); result = result.filter((item) => `${item.display_name} ${item.original_filename}`.toLowerCase().includes(query)); }
            const limit = Number(args[args.length - 2]); const offset = Number(args[args.length - 1]);
            return { results: result.slice(offset, offset + limit).map(presentRow) };
          };
          statement.run = async () => {
            if (sql.startsWith('INSERT INTO organization_assets')) {
              assets.push({ id: String(args[0]), organization_id: String(args[1]), storage_key: String(args[2]), original_filename: String(args[3]), display_name: String(args[4]), mime_type: String(args[5]), byte_size: Number(args[6]), category: String(args[7]), created_by: String(args[8]), created_at: Number(args[9]), updated_at: Number(args[10]), archived_at: null });
            } else if (sql.startsWith('UPDATE organization_assets SET display_name')) {
              const item = assets.find((asset) => asset.id === args[2] && asset.organization_id === args[3]); if (item) { item.display_name = String(args[0]); item.updated_at = Number(args[1]); }
            } else if (sql.startsWith('UPDATE organization_assets SET archived_at')) {
              const item = assets.find((asset) => asset.id === args[2] && asset.organization_id === args[3]); if (item) { item.archived_at = Number(args[0]); item.updated_at = Number(args[1]); }
            } else if (sql.includes('organization_activity')) {
              activity.push({ id: args[0], organization_id: args[1], actor_user_id: args[2], action: args[3], resource_type: args[4], resource_id: args[5], metadata: args[6], created_at: args[7] });
            }
            return { success: true, meta: { changes: 1 } };
          };
          return statement;
        },
      };
    },
  };
  const R2: any = {
    async put(key: string, bytes: ArrayBuffer) { objects.set(key, bytes); },
    async delete(key: string) { objects.delete(key); },
  };
  return { DB, EXPERIENCE_ASSETS: R2, ENVIRONMENT: 'test', APP_VERSION: 'test', assets, activity, objects };
}

function presentRow(asset: Asset) {
  return { id: asset.id, storageKey: asset.storage_key, originalFilename: asset.original_filename, displayName: asset.display_name, mimeType: asset.mime_type, byteSize: asset.byte_size, category: asset.category, createdAt: asset.created_at, updatedAt: asset.updated_at };
}

function request(path: string, env: any, init: RequestInit = {}) {
  const headers = new Headers({ Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init.headers ?? {}) });
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env);
}

function pngFile(name = 'logo.png') {
  return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], name, { type: 'image/png' });
}

function uploadForm(file: File, category = 'image') {
  const form = new FormData(); form.append('file', file); form.append('category', category); return form;
}

describe('organization asset library', () => {
  it('uploads with server-derived organization/actor metadata and records safe activity', async () => {
    const env = fixture({ role: 'admin' });
    const form = new FormData(); form.append('file', pngFile()); form.append('category', 'logo'); form.append('display_name', 'Marca principal');
    const response = await request('/organizations/assets', env, { method: 'POST', body: form });
    expect(response.status).toBe(201);
    const body = await response.json() as any;
    expect(body).toMatchObject({ displayName: 'Marca principal', category: 'logo', mimeType: 'image/png' });
    expect(body.url).toMatch(/^http:\/\/localhost\/assets\/organizations\/org-a\/assets\/[0-9a-f-]+\.png$/);
    expect(env.assets[0]).toMatchObject({ organization_id: 'org-a', created_by: 'actor', original_filename: 'logo.png' });
    expect(env.activity).toEqual([expect.objectContaining({ action: 'asset.uploaded', resource_type: 'asset', actor_user_id: 'actor', metadata: expect.not.stringContaining('password') })]);
  });

  it('accepts validated JPEG and WebP assets using organization keys', async () => {
    const env = fixture({ role: 'admin' });
    const jpeg = new File([new Uint8Array([255, 216, 255])], 'photo.jpg', { type: 'image/jpeg' });
    const webp = new File([new TextEncoder().encode('RIFF1234WEBP')], 'photo.webp', { type: 'image/webp' });
    const jpegResponse = await request('/organizations/assets', env, { method: 'POST', body: uploadForm(jpeg) });
    const webpResponse = await request('/organizations/assets', env, { method: 'POST', body: uploadForm(webp) });
    expect(jpegResponse.status).toBe(201); expect((await jpegResponse.json() as any).url).toMatch(/\/assets\/organizations\/org-a\/assets\/[0-9a-f-]+\.jpg$/);
    expect(webpResponse.status).toBe(201); expect((await webpResponse.json() as any).url).toMatch(/\/assets\/organizations\/org-a\/assets\/[0-9a-f-]+\.webp$/);
  });

  it('supports bounded organization-scoped listing, rename and conservative archive', async () => {
    const asset: Asset = { id: 'asset-1', organization_id: 'org-a', storage_key: 'organizations/org-a/assets/asset-1.png', original_filename: 'old.png', display_name: 'Old', mime_type: 'image/png', byte_size: 8, category: 'image', created_by: 'actor', created_at: 1, updated_at: 1, archived_at: null };
    const env = fixture({ role: 'admin', assets: [asset], referenced: true });
    expect((await request('/organizations/assets?limit=100', env)).status).toBe(200);
    const renamed = await request('/organizations/assets/asset-1', env, { method: 'PATCH', body: JSON.stringify({ displayName: 'New name' }) });
    expect(renamed.status).toBe(200);
    expect((await renamed.json() as any).displayName).toBe('New name');
    env.objects.set(asset.storage_key, new ArrayBuffer(8));
    const archived = await request('/organizations/assets/asset-1', env, { method: 'DELETE' });
    expect(await archived.json()).toEqual({ id: 'asset-1', archived: true, referenced: true });
    const listed = await request('/organizations/assets', env);
    expect(await listed.json()).toEqual({ items: [], pagination: { limit: 24, offset: 0, nextOffset: null } });
    expect(env.objects.has(asset.storage_key)).toBe(true);
    expect(env.activity.map((item) => item.action)).toEqual(['asset.renamed', 'asset.archived']);
  });

  it('rejects unsafe formats and keeps organization management narrow', async () => {
    const invalid = fixture({ role: 'admin' });
    const form = new FormData(); form.append('file', new File(['not an image'], '../../secret.txt', { type: 'text/plain' }));
    expect((await request('/organizations/assets', invalid, { method: 'POST', body: form })).status).toBe(415);
    const unsafe = new FormData(); unsafe.append('file', new File(['<svg><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' }));
    expect((await request('/organizations/assets', invalid, { method: 'POST', body: unsafe })).status).toBe(400);
    expect(invalid.assets).toHaveLength(0); expect(invalid.activity).toHaveLength(0);
    expect((await request('/organizations/assets', fixture({ role: 'member' }), { method: 'POST', body: new FormData() })).status).toBe(403);
    expect((await request('/organizations/assets', fixture({ role: 'viewer' }))).status).toBe(403);
    expect((await request('/organizations/assets', fixture({ role: 'operator' }))).status).toBe(403);
    expect((await request('/organizations/assets', fixture({ role: 'member' }))).status).toBe(200);
  });

  it('preserves platform-admin access while blocking a foreign organization context', async () => {
    expect((await request('/organizations/assets', fixture({ platformRole: 'super_admin' }))).status).toBe(200);
    expect((await request('/organizations/assets', fixture({ role: 'admin' }), { headers: { 'X-Organization-Id': 'org-b' } })).status).toBe(403);
  });
});
