/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import app from '../src';
import { validDraftConfig } from '../src/routes/experiences';

type E = { id: string; organization_id: string; name: string; slug: string; type: string; status: string; schema_version: number; draft_config: string; published_config: string | null; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string };
function fixture(initialDraft = '{"segments":[]}', initialStatus = 'draft', initialPublished: string | null = null) {
  const experiences: E[] = [
    { id: 'a', organization_id: 'org-a', name: 'A', slug: 'a', type: 'roulette', status: initialStatus, schema_version: 1, draft_config: initialDraft, published_config: initialPublished, starts_at: null, ends_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', organization_id: 'org-b', name: 'B', slug: 'b', type: 'roulette', status: 'draft', schema_version: 1, draft_config: '{}', published_config: null, starts_at: null, ends_at: null, created_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  const inventory: Array<{ experience_id: string; prize_id: string; stock_limit: number | null; stock_used: number }> = [];
  const db = { prepare(sql: string) { return { bind(...args: any[]) {
    return {
      async first<T>() {
        if (sql.includes('auth_sessions')) return { session_id: 's', id: 'u', email: 'u@x', name: 'U', platform_role: 'user', expires_at: Date.now() + 10000 } as T;
        if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role: 'owner' } as T;
        if (sql.includes('FROM experiences')) { const e = experiences.find((x) => sql.includes('slug=?') ? x.slug === args[0] : x.id === args[0] && x.organization_id === args[1]); return e ? { ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at } as T : null as T; }
        return null as T;
      },
      async all<T>() { if (sql.includes('experience_prize_inventory')) return { results: inventory.filter((item) => item.experience_id === args[0]).map((item) => ({ prizeId: item.prize_id, stockLimit: item.stock_limit, stockUsed: item.stock_used })) as T[] }; return { results: experiences.filter((e) => e.organization_id === args[0]).map((e) => ({ ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at })) as T[] }; },
      async run() { if (sql.includes('experience_prize_inventory') && sql.startsWith('INSERT')) { const existing = inventory.find((item) => item.experience_id === args[0] && item.prize_id === args[1]); if (existing) existing.stock_limit = args[2] as number | null; else inventory.push({ experience_id: args[0], prize_id: args[1], stock_limit: args[2] as number | null, stock_used: 0 }); } if (sql.includes('experience_prize_inventory') && sql.startsWith('UPDATE')) { const existing = inventory.find((item) => item.experience_id === args[0] && item.prize_id === args[1]); if (!existing || existing.stock_limit === null || existing.stock_used >= existing.stock_limit) return { success: true, meta: { changes: 0 } }; existing.stock_used += 1; return { success: true, meta: { changes: 1 } }; } if (sql.includes('published_config')) { const experience = experiences.find((e) => e.id === args[args.length - 2] && e.organization_id === args[args.length - 1]); if (experience) { experience.published_config = args[0] as string; experience.status = 'published'; } } const changes = sql.startsWith('DELETE') && !experiences.some((e) => e.id === args[0] && e.organization_id === args[1]) ? 0 : 1; return { success: true, meta: { changes } }; },
    };
  } }; } };
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  const assets = {
    async put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }) { objects.set(key, { bytes: value, contentType: options.httpMetadata.contentType }); },
    async get(key: string) { const object = objects.get(key); if (!object) return null; return { body: new Response(object.bytes).body, httpEtag: 'test-etag', writeHttpMetadata(headers: Headers) { headers.set('content-type', object.contentType); } }; },
  };
  return { DB: db, EXPERIENCE_ASSETS: assets, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}
function request(path: string, env: any, init?: RequestInit) { const headers = new Headers({ Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers }); return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env); }

describe('experiences tenant isolation and validation', () => {
  it('lists and reads only the current organization, parsing JSON', async () => { const env = fixture(); const list = await request('/experiences', env); expect(list.status).toBe(200); expect(await list.json()).toEqual([expect.objectContaining({ id: 'a', draftConfig: { segments: [] } })]); expect((await request('/experiences/b', env)).status).toBe(404); });
  it('rejects invalid dates/status and foreign mutations', async () => { const env = fixture(); const badDates = await request('/experiences', env, { method: 'POST', body: JSON.stringify({ name: 'x', starts_at: '2026-01-02', ends_at: '2026-01-01' }) }); expect(badDates.status).toBe(400); for (const status of ['nope', 'active', 'scheduled', 'expired']) { const badStatus = await request('/experiences/a', env, { method: 'PATCH', body: JSON.stringify({ status }) }); expect(badStatus.status).toBe(400); } expect((await request('/experiences/b', env, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) })).status).toBe(404); expect((await request('/experiences/b', env, { method: 'DELETE' })).status).toBe(404); });
});

describe('roulette draft_config validation', () => {
  const segment = (i: number, color = '#D6B25E', prizeId: string | null = 'prize-1') => ({ id: `seg-${i}`, prizeId, color });
  const six = () => [0, 1, 2, 3, 4, 5].map((i) => segment(i));
  it('accepts a valid six-segment config', () => expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: six() })).toBe(true));
  it('rejects fewer or more than ten segments', () => { const values = six(); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: values.slice(0, 5) })).toBe(false); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: [...values, ...[6, 7, 8, 9, 10].map((i) => segment(i))] })).toBe(false); });
  it('rejects invalid colors, prize references, and duplicate ids', () => { const values = six(); const base = { schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: values }; expect(validDraftConfig({ ...base, backgroundColor: 'black' })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, color: '#12' } : s) })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, prizeId: 'missing' } : s) })).toBe(false); expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'A' }, { id: 'prize-1', name: 'B' }] })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, id: 'seg-1' } : s) })).toBe(false); });
});

describe('experience prize assets', () => {
  const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'icon.png', { type: 'image/png' });
  const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" /></svg>'], 'icon.svg', { type: 'image/svg+xml' });
  const upload = (file: File, env = fixture()) => { const form = new FormData(); form.append('file', file); return request('/experiences/a/assets', env, { method: 'POST', body: form }); };
  it('uploads PNG and sanitizes valid SVG', async () => {
    const env = fixture();
    const pngResponse = await upload(png, env);
    expect(pngResponse.status).toBe(201);
    const pngResult = await pngResponse.json<{ url: string; key: string }>();
    expect(pngResult.key).toMatch(/^organizations\/org-a\/experiences\/a\/.*\.png$/);
    const served = await request(`/../assets/${pngResult.key}`, env, { headers: { Cookie: '' } });
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    const svgResponse = await upload(svg, env);
    expect(svgResponse.status).toBe(201);
    expect((await svgResponse.json<{ url: string }>()).url).toContain('/assets/organizations/org-a/experiences/a/');
  });
  it('rejects invalid MIME, oversized files, foreign experiences, and dangerous SVG', async () => {
    const env = fixture();
    expect((await upload(new File(['text'], 'x.txt', { type: 'text/plain' }), env)).status).toBe(415);
    expect((await upload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }), env)).status).toBe(413);
    const foreign = new FormData(); foreign.append('file', png); expect((await request('/experiences/b/assets', env, { method: 'POST', body: foreign })).status).toBe(404);
    expect((await upload(new File(['<svg><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' }), env)).status).toBe(400);
  });
  it('accepts only safe asset URLs in draft_config', () => {
    const base = { schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments() };
    expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'Remera', iconUrl: '/assets/organizations/org-a/experiences/a/123e4567-e89b-12d3-a456-426614174000.png' }] })).toBe(true);
    expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'Remera', iconUrl: 'javascript:alert(1)' }] })).toBe(false);
  });
});

describe('experience publishing', () => {
  const validDraft = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments() });
  it('publishes a snapshot and keeps it stable while draft changes', async () => {
    const env = fixture(validDraft);
    const published = await request('/experiences/a/publish', env, { method: 'POST' });
    expect(published.status).toBe(200);
    expect(await published.json()).toEqual(expect.objectContaining({ status: 'published', draftConfig: JSON.parse(validDraft), publishedConfig: JSON.parse(validDraft) }));
    const changed = JSON.stringify({ schemaVersion: 1, backgroundColor: '#222222', prizes: [{ id: 'prize-1', name: 'Gorra' }], segments: sixSegments() });
    expect((await request('/experiences/a', env, { method: 'PATCH', body: JSON.stringify({ draft_config: JSON.parse(changed) }) })).status).toBe(200);
    const detail = await request('/experiences/a', env);
    expect((await detail.json() as { publishedConfig: unknown }).publishedConfig).toEqual(JSON.parse(validDraft));
  });
  it('rejects invalid drafts and experiences from another organization', async () => {
    expect((await request('/experiences/b/publish', fixture(validDraft), { method: 'POST' })).status).toBe(404);
    expect((await request('/experiences/a/publish', fixture('{"segments":[]}'), { method: 'POST' })).status).toBe(400);
  });
});

function sixSegments() { return [0, 1, 2, 3, 4, 5].map((i) => ({ id: `seg-${i}`, color: '#D6B25E', prizeId: 'prize-1' })); }

describe('public published experience', () => {
  const published = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments() });
  it('returns only published_config for an active experience', async () => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/a'), fixture(published, 'published', published));
    expect(response.status).toBe(200);
    const body = await response.json() as { active: boolean; experience: Record<string, unknown> };
    expect(body.active).toBe(true);
    expect(body.experience.config).toEqual(JSON.parse(published));
    expect(body.experience).not.toHaveProperty('draft_config');
    expect(body.experience).not.toHaveProperty('organization_id');
  });
  it.each(['draft', 'paused'])('does not expose %s experiences', async (status) => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/a'), fixture(published, status, published));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false, reason: status });
  });
  it('returns 404 for an unknown slug', async () => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/missing'), fixture());
    expect(response.status).toBe(404);
  });

  it('returns a server-selected spin result without private fields', async () => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/a/spin', { method: 'POST', body: '{}' }), fixture(published, 'published', published));
    expect(response.status).toBe(200);
    const body = await response.json() as { spinId: string; segmentIndex: number; segment: { id: string; prizeId: string | null }; prize: { id: string; name: string; iconUrl: string | null } | null };
    expect(body.spinId).toEqual(expect.any(String));
    expect(body.segmentIndex).toBeGreaterThanOrEqual(0);
    expect(body.segmentIndex).toBeLessThan(6);
    expect(body.segment).toEqual({ id: `seg-${body.segmentIndex}`, prizeId: 'prize-1' });
    expect(body.prize).toEqual({ id: 'prize-1', name: 'Remera', iconUrl: null });
    expect(body).not.toHaveProperty('draft_config');
    expect(body).not.toHaveProperty('organization_id');
  });

  it('returns null prize for an eligible no-prize segment', async () => {
    const noPrize = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', enabled: false }], segments: sixSegments().map((segment, index) => index === 0 ? { ...segment, prizeId: null } : segment) });
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => { (array as Uint32Array)[0] = 0; return array; });
    try {
      const response = await app.fetch(new Request('http://localhost/public/experiences/a/spin', { method: 'POST' }), fixture(noPrize, 'published', noPrize));
      expect(response.status).toBe(200);
      const body = await response.json() as { segmentIndex: number; prize: unknown };
      expect(body.segmentIndex).toBe(0);
      expect(body.prize).toBeNull();
    } finally { random.mockRestore(); }
  });

  it.each(['draft', 'paused'])('does not spin %s experiences', async (status) => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/a/spin', { method: 'POST' }), fixture(published, status, published));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false, reason: status });
  });

  it('does not spin invalid published configuration', async () => {
    const response = await app.fetch(new Request('http://localhost/public/experiences/a/spin', { method: 'POST' }), fixture('{"segments":[]}', 'published', '{"segments":[]}'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ active: false, reason: 'unavailable' });
  });

  it('consumes limited inventory atomically and preserves it on republish', async () => {
    const limited = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', stockLimit: 2 }], segments: sixSegments() });
    const env = fixture(limited);
    expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200);
    expect((await request('/experiences/a/inventory', env)).status).toBe(200);
    expect((await request('/public/experiences/a/spin', env, { method: 'POST' })).status).toBe(200);
    expect((await request('/public/experiences/a/spin', env, { method: 'POST' })).status).toBe(200);
    const exhausted = await request('/public/experiences/a/spin', env, { method: 'POST' });
    expect(exhausted.status).toBe(200);
    expect(await exhausted.json()).toEqual({ active: false, reason: 'unavailable' });
    expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200);
    const inventory = await request('/experiences/a/inventory', env);
    expect(await inventory.json()).toEqual([{ prizeId: 'prize-1', stockLimit: 2, stockUsed: 2, stockRemaining: 0 }]);
  });

  it('isolates inventory by organization', async () => {
    const response = await request('/experiences/b/inventory', fixture(published, 'published', published));
    expect(response.status).toBe(404);
  });
});
