/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import app from '../src';
import { validDraftConfig } from '../src/routes/experiences';

type E = { id: string; organization_id: string; name: string; slug: string; type: string; status: string; schema_version: number; draft_config: string; published_config: string | null; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string };
type AccessPeriod = { id: string; experience_id: string; organization_id: string; starts_at: string; ends_at: string; source: string; created_at: string; created_by: string | null; note: string | null };
function fixture(initialDraft = '{"segments":[]}', initialStatus = 'draft', initialPublished: string | null = null, role = 'owner', initialAccessPeriods: AccessPeriod[] = []) {
  const experiences: E[] = [
    { id: 'a', organization_id: 'org-a', name: 'A', slug: 'a', type: 'roulette', status: initialStatus, schema_version: 1, draft_config: initialDraft, published_config: initialPublished, starts_at: null, ends_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', organization_id: 'org-b', name: 'B', slug: 'b', type: 'roulette', status: 'draft', schema_version: 1, draft_config: '{}', published_config: null, starts_at: null, ends_at: null, created_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  const inventory: Array<{ experience_id: string; prize_id: string; stock_mode: 'limited' | 'unlimited'; stock_available: number | null; delivered_count: number }> = [];
  const spins: Array<Record<string, unknown>> = [];
  const inventoryEvents: Array<Record<string, unknown>> = [];
  const accessPeriods = [...initialAccessPeriods];
  const db = { prepare(sql: string) { return { bind(...args: any[]) {
    return {
      __sql: sql, __args: args,
      async first<T>() {
        if (sql.includes('experience_prize_inventory') && sql.includes('stock_mode')) { const item = inventory.find((x) => x.experience_id === args[0] && x.prize_id === args[1]); return item ? { stockMode: item.stock_mode, stockAvailable: item.stock_available, deliveredCount: item.delivered_count } as T : null as T; }
        if (sql.includes('auth_sessions')) return { session_id: 's', id: 'u', email: 'u@x', name: 'U', platform_role: 'user', expires_at: Date.now() + 10000 } as T;
        if (sql.includes('experience_participation')) { const isDevice = args[2] === 'device'; const id = args[3]; const matches = spins.filter((x) => x.experienceId === args[0] && x.organizationId === args[1] && (isDevice ? x.participantDeviceId === id : x.participantSessionId === id)); const latest = matches.at(-1); return matches.length ? { spin_count: matches.length, last_spin_at: latest?.createdAt ?? null } as T : null as T; }
        if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role } as T;
        if (sql.includes('FROM experiences')) { const e = experiences.find((x) => sql.includes('slug=?') ? x.slug === args[0] : x.id === args[0] && x.organization_id === args[1]); return e ? { ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at } as T : null as T; }
        return null as T;
      },
      async all<T>() { if (sql.includes('experience_access_periods')) return { results: accessPeriods.filter((item) => item.experience_id === args[0] && item.organization_id === args[1]).map((item) => ({ id: item.id, experienceId: item.experience_id, organizationId: item.organization_id, startsAt: item.starts_at, endsAt: item.ends_at, source: item.source, createdAt: item.created_at, createdBy: item.created_by, note: item.note })) as T[] }; if (sql.includes('experience_prize_inventory')) return { results: inventory.filter((item) => item.experience_id === args[0]).map((item) => ({ prizeId: item.prize_id, stockMode: item.stock_mode, stockAvailable: item.stock_available, deliveredCount: item.delivered_count })) as T[] }; if (sql.includes('FROM experience_spins')) { const filtered = spins.filter((item) => item.organizationId === args[0] && item.experienceId === args[1]); const sorted = [...filtered].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id))); const offset = Number(args[args.length - 1]); const limit = Number(args[args.length - 2]); return { results: sorted.slice(offset, offset + limit).map((item) => item) as T[] }; } return { results: experiences.filter((e) => e.organization_id === args[0]).map((e) => ({ ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at })) as T[] }; },
      async run() { if (sql.startsWith('INSERT INTO experience_access_periods')) { accessPeriods.push({ id: args[0], experience_id: args[1], organization_id: args[2], starts_at: args[3], ends_at: args[4], source: args[5], created_at: '2026-01-03', created_by: args[6], note: args[7] }); } if (sql.startsWith('INSERT INTO experiences')) { experiences.push({ id: args[0], organization_id: args[1], name: args[2], slug: args[3], type: args[4], status: 'draft', schema_version: args[5] === 1 ? 1 : args[5], draft_config: args[6], published_config: null, starts_at: args[7], ends_at: args[8], created_at: '2026-01-03', updated_at: '2026-01-03' }); } if (sql.includes('experience_prize_inventory') && sql.startsWith('INSERT')) { const existing = inventory.find((item) => item.experience_id === args[0] && item.prize_id === args[1]); if (!existing) inventory.push({ experience_id: args[0], prize_id: args[1], stock_mode: args[2] as 'limited' | 'unlimited', stock_available: args[3] as number | null, delivered_count: 0 }); } if (sql.includes('stock_available=stock_available+?')) { const existing = inventory.find((item) => item.experience_id === args[1] && item.prize_id === args[2]); if (!existing) return { success: true, meta: { changes: 0 } }; existing.stock_available = (existing.stock_available ?? 0) + (args[0] as number); return { success: true, meta: { changes: 1 } }; } if (sql.includes('stock_available=stock_available-?')) { const existing = inventory.find((item) => item.experience_id === args[1] && item.prize_id === args[2]); if (!existing || (existing.stock_available ?? 0) < (args[0] as number)) return { success: true, meta: { changes: 0 } }; existing.stock_available = (existing.stock_available ?? 0) - (args[0] as number); return { success: true, meta: { changes: 1 } }; } if (sql.includes('experience_prize_inventory') && sql.startsWith('UPDATE')) { const limited = sql.includes('stock_available=stock_available-1'); const existing = inventory.find((item) => item.experience_id === args[0] && item.prize_id === args[1]); if (!existing || (limited && (existing.stock_available ?? 0) <= 0)) return { success: true, meta: { changes: 0 } }; if (limited) existing.stock_available = (existing.stock_available ?? 0) - 1; existing.delivered_count += 1; return { success: true, meta: { changes: 1 } }; } if (sql.includes('published_config')) { const experience = experiences.find((e) => e.id === args[args.length - 2] && e.organization_id === args[args.length - 1]); if (experience) { experience.published_config = args[0] as string; experience.status = 'published'; } } const changes = sql.startsWith('DELETE') && !experiences.some((e) => e.id === args[0] && e.organization_id === args[1]) ? 0 : 1; return { success: true, meta: { changes } }; },
    };
  } }; }, batch(statements: Array<{ __sql?: string; __args?: any[]; run: () => Promise<{ success: boolean; meta?: { changes?: number } }> }>) { for (const statement of statements) { if (statement.__sql?.includes('experience_spins')) { const args = statement.__args ?? []; spins.push({ id: args[0], experienceId: args[1], organizationId: args[2], applicationId: args[3], segmentId: args[4], segmentIndex: args[5], prizeId: args[6], participantDeviceId: args[7], participantSessionId: args[8], outcomeType: statement.__sql.includes("'prize'") ? 'prize' : 'no_prize', createdAt: new Date().toISOString() }); } if (statement.__sql?.includes('experience_prize_inventory_events')) { const args = statement.__args ?? []; inventoryEvents.push({ id: args[0], experienceId: args[1], prizeId: args[2], type: 'prize_delivered', quantity: 1, spinId: args[3] }); } } return Promise.all(statements.map((statement) => statement.run())); } };
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  const assets = {
    async put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }) { objects.set(key, { bytes: value, contentType: options.httpMetadata.contentType }); },
    async get(key: string) { const object = objects.get(key); if (!object) return null; return { body: new Response(object.bytes).body, httpEtag: 'test-etag', writeHttpMetadata(headers: Headers) { headers.set('content-type', object.contentType); } }; },
  };
  return { DB: db, EXPERIENCE_ASSETS: assets, ENVIRONMENT: 'test', APP_VERSION: 'test', __spins: spins, __inventoryEvents: inventoryEvents };
}
function request(path: string, env: any, init?: RequestInit) { const headers = new Headers({ Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init?.headers }); return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }), env); }

describe('experiences tenant isolation and validation', () => {
  it('lists and reads only the current organization, parsing JSON', async () => { const env = fixture(); const list = await request('/experiences', env); expect(list.status).toBe(200); expect(await list.json()).toEqual([expect.objectContaining({ id: 'a', draftConfig: { segments: [] } })]); expect((await request('/experiences/b', env)).status).toBe(404); });
  it('rejects invalid dates/status and foreign mutations', async () => { const env = fixture(); const badDates = await request('/experiences', env, { method: 'POST', body: JSON.stringify({ name: 'x', starts_at: '2026-01-02', ends_at: '2026-01-01' }) }); expect(badDates.status).toBe(400); for (const status of ['nope', 'active', 'scheduled', 'expired']) { const badStatus = await request('/experiences/a', env, { method: 'PATCH', body: JSON.stringify({ status }) }); expect(badStatus.status).toBe(400); } expect((await request('/experiences/b', env, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) })).status).toBe(404); expect((await request('/experiences/b', env, { method: 'DELETE' })).status).toBe(404); });

  it('clones only an owned experience and resets operational state', async () => {
    const env = fixture('{"schemaVersion":1,"backgroundColor":"#111111","prizes":[{"id":"p1","name":"Premio","enabled":true,"weight":1,"stockMode":"unlimited"}],"segments":[{"id":"s1","color":"#D6B25E","prizeId":"p1"}]}', 'draft', null, 'owner', [{ id: 'access-a', experience_id: 'a', organization_id: 'org-a', starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-02-01T00:00:00.000Z', source: 'manual', created_at: '2026-01-01T00:00:00.000Z', created_by: 'u', note: null }]);
    const response = await request('/experiences/a/clone', env, { method: 'POST', body: JSON.stringify({ organization_id: 'org-b' }) });
    expect(response.status).toBe(201);
    const cloned = await response.json() as { id: string; organizationId: string; name: string; slug: string; status: string; publishedConfig: unknown; draftConfig: unknown };
    expect(cloned).toMatchObject({ organizationId: 'org-a', name: 'A - Copia', status: 'draft', publishedConfig: null });
    expect(cloned.id).not.toBe('a');
    expect(cloned.slug).not.toBe('a');
    expect(cloned.draftConfig).toEqual(expect.objectContaining({ backgroundColor: '#111111' }));
    const clonedAccess = await request(`/experiences/${cloned.id}/access-periods`, env);
    expect(await clonedAccess.json()).toEqual({ items: [], status: 'legacy_unrestricted' });
    const sourceAccess = await request('/experiences/a/access-periods', env);
    expect(await sourceAccess.json()).toEqual(expect.objectContaining({ items: [expect.objectContaining({ id: 'access-a' })] }));
  });

  it('does not clone a foreign experience or allow members to clone', async () => {
    expect((await request('/experiences/b/clone', fixture(), { method: 'POST' })).status).toBe(404);
    expect((await request('/experiences/a/clone', fixture('{"segments":[]}', 'draft', null, 'member'), { method: 'POST' })).status).toBe(403);
  });

  it('manages tenant-scoped immutable commercial access periods', async () => {
    const env = fixture();
    const created = await request('/experiences/a/access-periods', env, { method: 'POST', body: JSON.stringify({ starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-02-01T00:00:00Z', note: 'Launch' }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(expect.objectContaining({ status: 'scheduled', period: expect.objectContaining({ source: 'manual', note: 'Launch' }) }));
    expect((await request('/experiences/a/access-periods', env)).status).toBe(200);
    expect((await request('/experiences/b/access-periods', env)).status).toBe(404);
    expect((await request('/experiences/a/access-periods', fixture('{"segments":[]}', 'draft', null, 'member'), { method: 'POST', body: JSON.stringify({ starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-02-01T00:00:00Z' }) })).status).toBe(403);
    expect((await request('/experiences/a/access-periods', env, { method: 'POST', body: JSON.stringify({ starts_at: '2026-02-01', ends_at: '2026-02-01' }) })).status).toBe(400);
  });
});

describe('experience permissions', () => {
  it('allows a member to read but blocks every CRM mutation', async () => {
    const env = fixture('{"segments":[]}', 'draft', null, 'member');
    expect((await request('/experiences', env)).status).toBe(200);
    expect((await request('/experiences/a', env, { method: 'PATCH', body: JSON.stringify({ name: 'blocked' }) })).status).toBe(403);
    expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(403);
    expect((await request('/experiences/a/assets', env, { method: 'POST', body: new FormData() })).status).toBe(403);
    expect((await request('/experiences/a/inventory/prize-1/adjust', env, { method: 'POST', body: JSON.stringify({ delta: 1 }) })).status).toBe(403);
    expect((await request('/experiences/a', env, { method: 'DELETE' })).status).toBe(403);
    expect((await request('/experiences', env, { method: 'POST', body: JSON.stringify({ name: 'blocked' }) })).status).toBe(403);
  });
  it('denies unauthenticated experience mutations', async () => {
    const env = fixture();
    expect((await app.fetch(new Request('http://localhost/experiences/a', { method: 'PATCH', body: JSON.stringify({ name: 'blocked' }) }), env)).status).toBe(401);
  });
});

describe('roulette draft_config validation', () => {
  const segment = (i: number, color = '#D6B25E', prizeId: string | null = 'prize-1') => ({ id: `seg-${i}`, prizeId, color });
  const six = () => [0, 1, 2, 3, 4, 5].map((i) => segment(i));
  it('accepts a valid six-segment config', () => expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: six() })).toBe(true));
  it('rejects fewer or more than ten segments', () => { const values = six(); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: values.slice(0, 5) })).toBe(false); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: [...values, ...[6, 7, 8, 9, 10].map((i) => segment(i))] })).toBe(false); });
  it('rejects invalid colors, prize references, and duplicate ids', () => { const values = six(); const base = { schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: values }; expect(validDraftConfig({ ...base, backgroundColor: 'black' })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, color: '#12' } : s) })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, prizeId: 'missing' } : s) })).toBe(false); expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'A' }, { id: 'prize-1', name: 'B' }] })).toBe(false); expect(validDraftConfig({ ...base, segments: values.map((s, i) => i === 0 ? { ...s, id: 'seg-1' } : s) })).toBe(false); });
  it('accepts backward-compatible effects and CTA configuration', () => { const base = { schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: six() }; expect(validDraftConfig({ ...base, effects: { sound: true, vibration: false, celebration: true }, resultCta: { enabled: true, label: 'Ver producto', url: 'https://example.com/product' } })).toBe(true); });
  it.each(['javascript:alert(1)', 'data:text/html,alert(1)'])('rejects unsafe CTA URL %s', (url) => { const base = { schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: six() }; expect(validDraftConfig({ ...base, resultCta: { enabled: true, label: 'Abrir', url } })).toBe(false); });
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

  it('keeps expired commercial experiences unavailable before spin mutations', async () => {
    const env = fixture(published, 'published', published, 'owner', [{ id: 'access-1', experience_id: 'a', organization_id: 'org-a', starts_at: '2020-01-01T00:00:00.000Z', ends_at: '2020-02-01T00:00:00.000Z', source: 'manual', created_at: '2020-01-01T00:00:00.000Z', created_by: null, note: null }]);
    expect(await (await app.fetch(new Request('http://localhost/public/experiences/a'), env)).json()).toEqual({ active: false, reason: 'unavailable' });
    const response = await app.fetch(new Request('http://localhost/public/experiences/a/spin', { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ active: false, reason: 'unavailable' });
    expect((env as any).__spins).toHaveLength(0);
  });

  it('consumes limited inventory atomically and preserves it on republish', async () => {
    const limited = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', stockMode: 'limited', initialStock: 2 }], segments: sixSegments() });
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
    expect(await inventory.json()).toEqual({ items: [{ prizeId: 'prize-1', name: 'Remera', iconUrl: null, enabled: true, weight: 1, stockMode: 'limited', stockAvailable: 0, deliveredCount: 2 }] });
  });

  it('isolates inventory by organization', async () => {
    const response = await request('/experiences/b/inventory', fixture(published, 'published', published));
    expect(response.status).toBe(404);
  });

  it('adjusts only limited stock and never changes delivered count', async () => {
    const env = fixture(JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', stockMode: 'limited', initialStock: 2 }], segments: sixSegments() }));
    expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200);
    expect((await request('/experiences/a/inventory/prize-1/adjust', env, { method: 'POST', body: JSON.stringify({ delta: 3 }) })).status).toBe(200);
    expect((await request('/experiences/a/inventory/prize-1/adjust', env, { method: 'POST', body: JSON.stringify({ delta: -1 }) })).status).toBe(200);
    expect((await request('/experiences/a/inventory/prize-1/adjust', env, { method: 'POST', body: JSON.stringify({ delta: -99 }) })).status).toBe(400);
    const result = await request('/experiences/a/inventory', env); expect((await result.json() as { items: Array<{ stockAvailable: number; deliveredCount: number }> }).items[0]).toEqual(expect.objectContaining({ stockAvailable: 4, deliveredCount: 0 }));
  });
});

describe('authoritative experience spin history', () => {
  const prizeConfig = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments() });
  const noPrizeConfig = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', enabled: false }], segments: sixSegments().map((segment) => ({ ...segment, prizeId: null })) });
  async function spin(env: any) { const response = await request('/public/experiences/a/spin', env, { method: 'POST' }); expect(response.status).toBe(200); return response.json() as Promise<{ spinId: string; segmentIndex: number; segment: { id: string; prizeId: string | null }; prize: { id: string } | null }>; }
  async function history(env: any, path = '/experiences/a/spins') { const response = await request(path, env); expect(response.status).toBe(200); return response.json() as Promise<{ items: Array<Record<string, unknown>>; pagination: { limit: number; offset: number; nextOffset: number | null } }>; }

  it('persists prize and no-prize spins with the response spinId', async () => {
    const prizeEnv = fixture(prizeConfig, 'published', prizeConfig); const prize = await spin(prizeEnv); const prizeHistory = await history(prizeEnv); expect(prizeHistory.items[0]).toMatchObject({ id: prize.spinId, experienceId: 'a', segmentId: prize.segment.id, segmentIndex: prize.segmentIndex, prizeId: 'prize-1', outcomeType: 'prize' });
    const noPrizeEnv = fixture(noPrizeConfig, 'published', noPrizeConfig); const noPrize = await spin(noPrizeEnv); const noPrizeHistory = await history(noPrizeEnv); expect(noPrizeHistory.items[0]).toMatchObject({ id: noPrize.spinId, prizeId: null, outcomeType: 'no_prize', segmentIndex: noPrize.segmentIndex, segmentId: noPrize.segment.id });
  });
  it('requires auth, isolates organizations, and paginates newest-first', async () => {
    const env = fixture(prizeConfig, 'published', prizeConfig); await spin(env); await spin(env); const page = await history(env, '/experiences/a/spins?limit=1'); expect(page.items).toHaveLength(1); expect(page.pagination.nextOffset).toBe(1); const next = await history(env, '/experiences/a/spins?limit=1&offset=1'); expect(next.items).toHaveLength(1); expect((await request('/experiences/b/spins', env)).status).toBe(404); expect((await app.fetch(new Request('http://localhost/experiences/a/spins'), env)).status).toBe(401);
  });
  it('persists limited delivery and spin with the same spinId', async () => {
    const limited = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', stockMode: 'limited', initialStock: 1 }], segments: sixSegments() }); const env = fixture(limited); expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200); const spinResult = await spin(env); const item = (await history(env)).items[0]; expect(item).toMatchObject({ id: spinResult.spinId, prizeId: 'prize-1', outcomeType: 'prize' }); expect((env as any).__inventoryEvents).toEqual([expect.objectContaining({ spinId: spinResult.spinId, type: 'prize_delivered', quantity: 1 })]); const inventory = await request('/experiences/a/inventory', env); expect((await inventory.json() as { items: Array<{ stockAvailable: number; deliveredCount: number }> }).items[0]).toMatchObject({ stockAvailable: 0, deliveredCount: 1 });
  });
  it('does not create a successful history row for exhausted limited stock', async () => {
    const limited = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera', stockMode: 'limited', initialStock: 0 }], segments: sixSegments() }); const env = fixture(limited); expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200); const response = await request('/public/experiences/a/spin', env, { method: 'POST' }); expect(response.status).toBe(200); expect(await response.json()).toEqual({ active: false, reason: 'unavailable' }); expect((await history(env)).items).toHaveLength(0);
  });
});

describe('experience participation limits', () => {
  const ids = { device: '11111111-1111-4111-8111-111111111111', otherDevice: '22222222-2222-4222-8222-222222222222', session: '33333333-3333-4333-8333-333333333333', otherSession: '44444444-4444-4444-8444-444444444444' };
  const config = (participation: Record<string, unknown>) => JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments(), participation });
  const spin = (env: any, deviceId = ids.device, sessionId = ids.session) => request('/public/experiences/a/spin', env, { method: 'POST', body: JSON.stringify({ deviceId, sessionId }) });
  const json = async (response: Response) => response.json() as Promise<Record<string, any>>;

  it('keeps legacy configs unlimited and stores anonymous identity only in authoritative history', async () => {
    const env = fixture(prizeConfigForParticipation, 'published', prizeConfigForParticipation); const response = await spin(env); expect(response.status).toBe(200); expect((env as any).__spins[0]).toEqual(expect.objectContaining({ participantDeviceId: ids.device, participantSessionId: ids.session })); expect(await json(response)).not.toHaveProperty('deviceId');
  });
  it('enforces device limits and does not create a second history row', async () => {
    const published = config({ maxSpinsPerDevice: 1, maxSpinsPerSession: null, cooldownSeconds: 0 }); const env = fixture(published, 'published', published); expect((await spin(env)).status).toBe(200); const blocked = await spin(env); expect(blocked.status).toBe(429); expect(await json(blocked)).toEqual(expect.objectContaining({ error: 'participation_limit_reached', reason: 'device_limit' })); expect((env as any).__spins).toHaveLength(1);
  });
  it('allows exactly three device spins and different devices independently', async () => {
    const published = config({ maxSpinsPerDevice: 3, maxSpinsPerSession: null, cooldownSeconds: 0 }); const env = fixture(published, 'published', published); expect((await spin(env)).status).toBe(200); expect((await spin(env, ids.device, ids.otherSession)).status).toBe(200); expect((await spin(env)).status).toBe(200); expect((await spin(env)).status).toBe(429); expect((await spin(env, ids.otherDevice)).status).toBe(200);
  });
  it('enforces session limits while allowing another session', async () => {
    const published = config({ maxSpinsPerDevice: null, maxSpinsPerSession: 1, cooldownSeconds: 0 }); const env = fixture(published, 'published', published); expect((await spin(env)).status).toBe(200); expect((await spin(env)).status).toBe(429); expect((await spin(env, ids.device, ids.otherSession)).status).toBe(200);
  });
  it('requires identity when the configured policy needs it', async () => {
    const published = config({ maxSpinsPerDevice: 1, maxSpinsPerSession: null, cooldownSeconds: 0 }); const env = fixture(published, 'published', published); const response = await request('/public/experiences/a/spin', env, { method: 'POST', body: '{}' }); expect(response.status).toBe(400); expect(await json(response)).toEqual(expect.objectContaining({ error: 'participation_limit_reached', reason: 'identity_required' })); expect((env as any).__spins).toHaveLength(0);
  });
  it('enforces cooldown, returns retryAt, and leaves stock untouched when blocked', async () => {
    const published = config({ maxSpinsPerDevice: null, maxSpinsPerSession: null, cooldownSeconds: 300 }); const env = fixture(published); expect((await request('/experiences/a/publish', env, { method: 'POST' })).status).toBe(200); expect((await spin(env)).status).toBe(200); const blocked = await spin(env); const blockedBody = await json(blocked); expect(blocked.status).toBe(429); expect(blockedBody.reason).toBe('cooldown'); expect(new Date(blockedBody.retryAt).getTime()).toBeGreaterThan(Date.now()); expect((env as any).__spins).toHaveLength(1); expect((await request('/experiences/a/inventory', env)).status).toBe(200);
  });
  it('rejects invalid participation configuration', async () => {
    expect(validDraftConfig(JSON.parse(config({ maxSpinsPerDevice: 0, maxSpinsPerSession: null, cooldownSeconds: 0 })))).toBe(false); expect(validDraftConfig(JSON.parse(config({ maxSpinsPerDevice: null, maxSpinsPerSession: null, cooldownSeconds: 604801 })))).toBe(false);
  });
});

const prizeConfigForParticipation = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'prize-1', name: 'Remera' }], segments: sixSegments() });
