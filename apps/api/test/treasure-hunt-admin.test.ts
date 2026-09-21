import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../src';

function fixture(role = 'owner') {
  const DB = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async <T>() => {
            if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user', email: 'user@example.com', name: 'User', platformRole: 'user', expires_at: Date.now() + 60_000 } as T;
            if (sql.includes('FROM organizations')) return { id: args[0], name: 'Org', slug: 'org', role } as T;
            return null as T;
          },
          all: async <T>() => ({ results: [] as T[] }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', TREASURE_HUNT_ADMIN_API_URL: 'http://127.0.0.1:8791', TREASURE_HUNT_ADMIN_TOKEN: 'server-only-token' };
}

function request(path: string, env: ReturnType<typeof fixture>, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=session', 'X-Organization-Id': 'org-a', ...init?.headers } }), env as never);
}

describe('Treasure Hunt PEC server boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires an authenticated PEC session and never exposes the integration credential', async () => {
    const response = await app.fetch(new Request('http://localhost/admin/treasure-hunt/campaigns', { headers: { 'X-Organization-Id': 'org-a' } }), fixture() as never);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain('server-only-token');
  });

  it('forwards only the organization-scoped read request server-side', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', upstream);
    const response = await request('/admin/treasure-hunt/campaigns', fixture());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ items: [] });
    expect(upstream).toHaveBeenCalledWith('http://127.0.0.1:8791/v1/admin/hunts', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-only-token', 'X-Organization-Id': 'org-a' }) }));
    expect(body).not.toContain('server-only-token');
  });

  it('forwards draft writes only for crm.manage and preserves ETag concurrency headers', async () => {
    const upstream = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ draft: { revision: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"1"' } }));
    vi.stubGlobal('fetch', upstream);
    const create = await request('/admin/treasure-hunt/campaigns', fixture(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Demo', slug: 'demo', description: '', progressionMode: 'SEQUENTIAL', steps: [], reward: null }) });
    expect(create.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith('http://127.0.0.1:8791/v1/admin/hunts', expect.objectContaining({ method: 'POST', body: expect.any(String), headers: expect.objectContaining({ Authorization: 'Bearer server-only-token', 'X-Organization-Id': 'org-a' }) }));

    const draft = await request('/admin/treasure-hunt/campaigns/campaign-a/draft', fixture(), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' }, body: JSON.stringify({ name: 'Demo', slug: 'demo', description: '', progressionMode: 'SEQUENTIAL', steps: [], reward: null }) });
    expect(draft.status).toBe(200);
    expect(draft.headers.get('ETag')).toBe('"1"');
    expect(upstream).toHaveBeenLastCalledWith('http://127.0.0.1:8791/v1/admin/hunts/campaign-a/draft', expect.objectContaining({ method: 'PUT', body: expect.any(String), headers: expect.objectContaining({ 'If-Match': '"1"', 'X-CRM-Permissions': 'crm.manage' }) }));
  });

  it('keeps draft writes unavailable to read-only memberships', async () => {
    const response = await request('/admin/treasure-hunt/campaigns', fixture('viewer'), { method: 'POST', body: JSON.stringify({}) });
    expect(response.status).toBe(403);
  });

  it('maps an upstream not found and unavailable response without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"code":"CAMPAIGN_NOT_FOUND"}}', { status: 404 })));
    const missing = await request('/admin/treasure-hunt/campaigns/campaign-b', fixture());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret upstream details')));
    const unavailable = await request('/admin/treasure-hunt/campaigns', fixture());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: { code: 'TREASURE_HUNT_UNAVAILABLE' } });
  });

  it('enforces the existing read permission', async () => {
    const response = await request('/admin/treasure-hunt/campaigns', fixture('viewer'));
    expect(response.status).toBe(403);
  });

  it('forwards target upload, preview and compile through the authenticated server boundary', async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ draft: { revision: 2 } }), { status: 200, headers: { ETag: '"2"' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ draft: { revision: 2 } }), { status: 200, headers: { ETag: '"2"' } }));
    vi.stubGlobal('fetch', upstream);
    const form = new FormData();
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'target.png', { type: 'image/png' }));
    form.append('physicalWidthCm', '18');
    const upload = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/steps/step-a/target', fixture(), { method: 'POST', headers: { 'If-Match': '"1"' }, body: form });
    expect(upload.status).toBe(200);
    const uploadCall = upstream.mock.calls[0]?.[1] as RequestInit;
    expect(uploadCall.method).toBe('POST');
    expect(uploadCall.headers).toMatchObject({ Authorization: 'Bearer server-only-token', 'X-Organization-Id': 'org-a', 'X-Physical-Width-Cm': '18', 'X-Original-Filename': 'target.png', 'If-Match': '"1"' });
    expect((await new Response(uploadCall.body).arrayBuffer()).byteLength).toBe(4);

    const preview = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/steps/step-a/target', fixture());
    expect(preview.status).toBe(200);
    expect(preview.headers.get('Content-Type')).toContain('image/png');

    const compile = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/compile', fixture(), { method: 'POST', headers: { 'If-Match': '"2"' } });
    expect(compile.status).toBe(200);
    expect(upstream).toHaveBeenLastCalledWith('http://127.0.0.1:8791/v1/admin/hunts/campaign-a/draft/compile', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'If-Match': '"2"' }) }));
  });

  it('forwards browser compilation, artifact upload, status and publish without exposing the upstream credential', async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'BROWSER_COMPILATION_REQUIRED', compilationId: 'compile-a', draftRevision: 3, compilerVersion: 'tracear-sdk-0.2.1-browser', maxArtifactBytes: 50 * 1024 * 1024, targets: [{ stepId: 'step-a', order: 1, url: 'http://worker.local/target' }] }), { status: 202, headers: { 'Content-Type': 'application/json', ETag: '"3"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ draft: { revision: 3 } }), { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"3"' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ compilation: { id: 'compile-a', draftRevision: 3, status: 'COMPILED', jobStatus: 'COMPILED' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'PUBLISHED', version: { id: 'version-a', version: 1, publishedAt: '2026-09-21T00:00:00.000Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', upstream);

    const start = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/compile', fixture(), { method: 'POST', headers: { 'If-Match': '"3"' } });
    expect(start.status).toBe(202);
    expect(start.headers.get('ETag')).toBe('"3"');
    expect(upstream.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: '', headers: expect.objectContaining({ 'X-CRM-Permissions': 'crm.manage', 'If-Match': '"3"' }) }));

    const artifact = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/compile/compile-a/artifact', fixture(), { method: 'POST', headers: { 'If-Match': '"3"', 'Content-Type': 'application/octet-stream' }, body: new Uint8Array([84, 82, 80, 75]) });
    expect(artifact.status).toBe(200);
    const artifactCall = upstream.mock.calls[1]?.[1] as RequestInit;
    expect(artifactCall.headers).toMatchObject({ 'Content-Type': 'application/octet-stream', 'X-CRM-Permissions': 'crm.manage', 'If-Match': '"3"' });
    expect((await new Response(artifactCall.body).arrayBuffer()).byteLength).toBe(4);

    const status = await request('/admin/treasure-hunt/campaigns/campaign-a/draft/compile/compile-a', fixture());
    expect(status.status).toBe(200);
    expect(upstream.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'X-CRM-Permissions': 'crm.read' }) }));

    const publish = await request('/admin/treasure-hunt/campaigns/campaign-a/publish', fixture(), { method: 'POST', headers: { 'If-Match': '"3"', 'Idempotency-Key': 'campaign-a:3' } });
    expect(publish.status).toBe(200);
    expect(upstream.mock.calls[3]?.[0]).toBe('http://127.0.0.1:8791/v1/admin/hunts/campaign-a/publish');
    expect(upstream.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'X-CRM-Permissions': 'crm.manage', 'If-Match': '"3"', 'Idempotency-Key': 'campaign-a:3' }) }));
    expect(JSON.stringify(await publish.json())).not.toContain('server-only-token');
  });
});
