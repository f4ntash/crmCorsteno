/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { validDraftConfig } from '../src/routes/experiences';

type E = { id: string; organization_id: string; name: string; slug: string; type: string; status: string; schema_version: number; draft_config: string; published_config: null; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string };
function fixture() {
  const experiences: E[] = [
    { id: 'a', organization_id: 'org-a', name: 'A', slug: 'a', type: 'roulette', status: 'draft', schema_version: 1, draft_config: '{"segments":[]}', published_config: null, starts_at: null, ends_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'b', organization_id: 'org-b', name: 'B', slug: 'b', type: 'roulette', status: 'draft', schema_version: 1, draft_config: '{}', published_config: null, starts_at: null, ends_at: null, created_at: '2026-01-02', updated_at: '2026-01-02' },
  ];
  const db = { prepare(sql: string) { return { bind(...args: any[]) {
    return {
      async first<T>() {
        if (sql.includes('auth_sessions')) return { session_id: 's', id: 'u', email: 'u@x', name: 'U', platform_role: 'user', expires_at: Date.now() + 10000 } as T;
        if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role: 'owner' } as T;
        if (sql.includes('FROM experiences')) { const e = experiences.find((x) => x.id === args[0] && x.organization_id === args[1]); return e ? { ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at } as T : null as T; }
        return null as T;
      },
      async all<T>() { return { results: experiences.filter((e) => e.organization_id === args[0]).map((e) => ({ ...e, organizationId: e.organization_id, schemaVersion: e.schema_version, draftConfig: e.draft_config, publishedConfig: e.published_config, startsAt: e.starts_at, endsAt: e.ends_at, createdAt: e.created_at, updatedAt: e.updated_at })) as T[] }; },
      async run() { const changes = sql.startsWith('DELETE') && !experiences.some((e) => e.id === args[0] && e.organization_id === args[1]) ? 0 : 1; return { success: true, meta: { changes } }; },
    };
  } }; } };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}
function request(path: string, env: any, init?: RequestInit) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...init?.headers } }), env); }

describe('experiences tenant isolation and validation', () => {
  it('lists and reads only the current organization, parsing JSON', async () => { const env = fixture(); const list = await request('/experiences', env); expect(list.status).toBe(200); expect(await list.json()).toEqual([expect.objectContaining({ id: 'a', draftConfig: { segments: [] } })]); expect((await request('/experiences/b', env)).status).toBe(404); });
  it('rejects invalid dates/status and foreign mutations', async () => { const env = fixture(); const badDates = await request('/experiences', env, { method: 'POST', body: JSON.stringify({ name: 'x', starts_at: '2026-01-02', ends_at: '2026-01-01' }) }); expect(badDates.status).toBe(400); for (const status of ['nope', 'active', 'scheduled', 'expired']) { const badStatus = await request('/experiences/a', env, { method: 'PATCH', body: JSON.stringify({ status }) }); expect(badStatus.status).toBe(400); } expect((await request('/experiences/b', env, { method: 'PATCH', body: JSON.stringify({ name: 'x' }) })).status).toBe(404); expect((await request('/experiences/b', env, { method: 'DELETE' })).status).toBe(404); });
});

describe('roulette draft_config validation', () => {
  const segment = (i: number, color = '#D6B25E', label = `Premio ${i}`) => ({ id: `seg-${i}`, label, color });
  const six = () => [0, 1, 2, 3, 4, 5].map((i) => segment(i));
  it('accepts a valid six-segment config', () => expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', segments: six() })).toBe(true));
  it('rejects fewer or more than ten segments', () => { const values = six(); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', segments: values.slice(0, 5) })).toBe(false); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', segments: [...values, ...[6, 7, 8, 9, 10].map((i) => segment(i))] })).toBe(false); });
  it('rejects invalid colors and empty labels', () => { const values = six(); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: 'black', segments: values })).toBe(false); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', segments: values.map((s, i) => i === 0 ? { ...s, color: '#12' } : s) })).toBe(false); expect(validDraftConfig({ schemaVersion: 1, backgroundColor: '#111111', segments: values.map((s, i) => i === 0 ? { ...s, label: ' ' } : s) })).toBe(false); });
});
