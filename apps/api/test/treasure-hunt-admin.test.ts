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
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', TREASURE_HUNT_ADMIN_API_URL: 'https://treasure-hunt.example', TREASURE_HUNT_ADMIN_TOKEN: 'server-only-token' };
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
    expect(upstream).toHaveBeenCalledWith('https://treasure-hunt.example/v1/admin/hunts', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-only-token', 'X-Organization-Id': 'org-a' }) }));
    expect(body).not.toContain('server-only-token');
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
});
