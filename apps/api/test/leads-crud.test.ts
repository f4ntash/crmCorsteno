import { createRequire } from 'module';
import type { D1Database } from '@cloudflare/workers-types';
import { describe, expect, it } from 'vitest';
import app from '../src';

type SQLiteValue = string | number | bigint | null | Uint8Array;
type SQLiteStatement = { get(...args: SQLiteValue[]): unknown; all(...args: SQLiteValue[]): unknown[]; run(...args: SQLiteValue[]): { changes: number } };
type SQLiteConnection = { exec(sql: string): void; prepare(sql: string): SQLiteStatement };
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SQLiteConnection };

class LeadsD1 {
  readonly sqlite = new DatabaseSync(':memory:');
  constructor() {
    this.sqlite.exec(`
      CREATE TABLE leads (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, business_name TEXT NOT NULL, category TEXT NOT NULL, subcategory TEXT, description TEXT, website TEXT NOT NULL, domain TEXT NOT NULL, city TEXT NOT NULL, province_state TEXT NOT NULL, country TEXT NOT NULL, address TEXT, google_maps_url TEXT, instagram_url TEXT, linkedin_url TEXT, phone TEXT, contact_name TEXT, contact_role TEXT, contact_email TEXT, source TEXT NOT NULL, source_reference TEXT, dedupe_key TEXT, score INTEGER, recommended_offer TEXT, recommended_demo TEXT, status TEXT NOT NULL, notes TEXT, last_contact_at INTEGER, next_action_at INTEGER, archived_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX leads_org_dedupe_key ON leads (organization_id, dedupe_key);
      CREATE TABLE lead_jobs (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL, total INTEGER NOT NULL, processed INTEGER NOT NULL, succeeded INTEGER NOT NULL, failed INTEGER NOT NULL, metadata TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER);
      CREATE TABLE organization_activity (id TEXT PRIMARY KEY, organization_id TEXT, actor_user_id TEXT, action TEXT, resource_type TEXT, resource_id TEXT, metadata TEXT, created_at INTEGER);
    `);
  }
  prepare(sql: string) {
    const sqlite = this.sqlite;
    return { bind(...args: unknown[]) {
      if (sql.includes('auth_sessions')) return {
        async first<T>() { return { session_id: 'session', id: 'user-a', email: 'admin@example.com', name: 'Admin', platformRole: 'corsteno_admin', expires_at: Date.now() + 60_000 } as T; },
        async all<T>() { return { results: [] as T[] }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      if (sql.includes('FROM organizations')) return {
        async first<T>() { const id = sql.includes('slug=?') ? 'org-a' : String(args[1] ?? args[0]); return { id, name: id, slug: id, role: 'global_admin' } as T; },
        async all<T>() { return { results: [] as T[] }; },
        async run() { return { success: true, meta: { changes: 0 } }; },
      };
      const statement = sqlite.prepare(sql);
      return {
        async first<T>() { return (statement.get(...args as SQLiteValue[]) as T | undefined) ?? null; },
        async all<T>() { return { results: statement.all(...args as SQLiteValue[]) as T[] }; },
        async run() { const result = statement.run(...args as SQLiteValue[]); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
    } };
  }
}

function env() { const database = new LeadsD1(); return { DB: database, LEAD_JOB_QUEUE: { async send() {} }, FINDER_JOB_QUEUE: { async send() {} }, ENVIRONMENT: 'test', APP_VERSION: 'test', database } as unknown as { DB: D1Database; database: LeadsD1 }; }
function request(path: string, environment: { DB: D1Database }, organization = 'org-a', init: RequestInit = {}) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=test', 'X-Organization-Id': organization, 'Content-Type': 'application/json', ...init.headers } }), environment as never); }
function insertLead(database: LeadsD1, values: { id: string; organizationId: string; domain: string; dedupeKey?: string | null; archivedAt?: number | null }) { database.sqlite.prepare('INSERT INTO leads (id,organization_id,business_name,category,website,domain,city,province_state,country,source,dedupe_key,status,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(values.id, values.organizationId, 'Demo Lead', 'inmobiliaria', `https://${values.domain}`, values.domain, 'Córdoba', 'Córdoba', 'Argentina', 'finder', values.dedupeKey ?? null, 'NEW', values.archivedAt ?? null, 1, 1); }

describe('Leads manual CRUD and archival API', () => {
  it('creates manually, normalizes duplicate checks, and returns the fresh detail', async () => {
    const environment = env();
    const createdResponse = await request('/leads', environment, 'org-a', { method: 'POST', body: JSON.stringify({ businessName: 'Lead Sintético', category: 'inmobiliaria', website: 'https://www.sintetico.example/', city: 'Córdoba', provinceState: 'Córdoba', country: 'Argentina', source: 'manual', contactEmail: 'contacto@sintetico.example' }) });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string; domain: string; archivedAt: number | null };
    expect(created).toMatchObject({ domain: 'sintetico.example', archivedAt: null });
    expect((environment.database.sqlite.prepare('SELECT dedupe_key FROM leads WHERE id=?').get(created.id) as { dedupe_key: string }).dedupe_key).toBe('manual:domain:sintetico.example');
    const duplicate = await request('/leads', environment, 'org-a', { method: 'POST', body: JSON.stringify({ businessName: 'Otro nombre', category: 'inmobiliaria', website: 'https://sintetico.example', city: 'Rosario', provinceState: 'Santa Fe', country: 'Argentina', source: 'manual' }) });
    expect(duplicate.status).toBe(409);
    environment.database.sqlite.prepare('UPDATE leads SET business_name=? WHERE id=?').run('Nombre actualizado externamente', created.id);
    const detail = await request(`/leads/${created.id}`, environment);
    expect((await detail.json() as { lead: { businessName: string } }).lead.businessName).toBe('Nombre actualizado externamente');
  });

  it('keeps lead reads and writes scoped to the active organization', async () => {
    const environment = env();
    insertLead(environment.database, { id: 'lead-a', organizationId: 'org-a', domain: 'a.example' });
    insertLead(environment.database, { id: 'lead-b', organizationId: 'org-b', domain: 'b.example' });
    expect((await request('/leads/lead-b', environment, 'org-a')).status).toBe(404);
    const list = await request('/leads?archive=all', environment, 'org-a');
    expect((await list.json() as { items: Array<{ id: string }> }).items.map((item) => item.id)).toEqual(['lead-a']);
  });

  it('archives without deleting, filters archived records, and restores them', async () => {
    const environment = env();
    insertLead(environment.database, { id: 'lead-archive', organizationId: 'org-a', domain: 'archive.example' });
    expect((await request('/leads/lead-archive/archive', environment, 'org-a', { method: 'POST' })).status).toBe(200);
    expect(await (await request('/leads', environment)).json()).toMatchObject({ items: [] });
    expect(await (await request('/leads?archive=archived', environment)).json()).toMatchObject({ items: [{ id: 'lead-archive' }] });
    expect((await request('/leads/lead-archive/restore', environment, 'org-a', { method: 'POST' })).status).toBe(200);
    expect(await (await request('/leads', environment)).json()).toMatchObject({ items: [{ id: 'lead-archive' }] });
  });

  it('uses the same stable-domain guard against Finder records without over-aggressive matching', async () => {
    const environment = env();
    insertLead(environment.database, { id: 'finder-lead', organizationId: 'org-a', domain: 'finder.example', dedupeKey: 'domain:finder.example:cordoba' });
    const duplicate = await request('/leads', environment, 'org-a', { method: 'POST', body: JSON.stringify({ businessName: 'Manual duplicate', category: 'inmobiliaria', website: 'https://finder.example', city: 'Córdoba', provinceState: 'Córdoba', country: 'Argentina', source: 'manual' }) });
    expect(duplicate.status).toBe(409);
    const allowed = await request('/leads', environment, 'org-a', { method: 'POST', body: JSON.stringify({ businessName: 'Another location', category: 'inmobiliaria', website: 'https://another.example', city: 'Córdoba', provinceState: 'Córdoba', country: 'Argentina', source: 'manual' }) });
    expect(allowed.status).toBe(201);
  });

  it('rejects unknown archival filters', async () => {
    const response = await request('/leads?archive=unknown', env());
    expect(response.status).toBe(400);
  });

  it('paginates and sorts with a validated allowlist while keeping facets independent of the page', async () => {
    const environment = env();
    insertLead(environment.database, { id: 'lead-z', organizationId: 'org-a', domain: 'z.example' });
    environment.database.sqlite.prepare('UPDATE leads SET business_name=?,category=?,recommended_offer=?,score=?,updated_at=? WHERE id=?').run('Zeta', 'restaurante', 'Oferta Z', 20, 3, 'lead-z');
    insertLead(environment.database, { id: 'lead-a', organizationId: 'org-a', domain: 'a.example' });
    environment.database.sqlite.prepare('UPDATE leads SET business_name=?,category=?,recommended_offer=?,score=?,updated_at=? WHERE id=?').run('Alfa', 'inmobiliaria', 'Oferta A', 90, 2, 'lead-a');
    const page = await request('/leads?limit=1&offset=0&sort=score_desc', environment);
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ items: [{ id: 'lead-a' }], total: 2, facets: { categories: ['inmobiliaria', 'restaurante'], offers: ['Oferta A', 'Oferta Z'] } });
    expect((await request('/leads?sort=unknown', environment)).status).toBe(400);
  });
});
