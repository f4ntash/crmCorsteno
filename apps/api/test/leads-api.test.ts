/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type StoredJob = { id: string; organization_id: string; type: string; status: string; progress: number; total: number; processed: number; succeeded: number; failed: number; metadata: string; error: string|null; created_at: number; updated_at: number; started_at: number|null; finished_at: number|null };
function environment(role = 'owner', organizationId = 'org-a', initial: StoredJob[] = []) {
  const jobs = [...initial];
  const db = { prepare(sql: string) { return { bind(...args: any[]) { return {
    async first<T>() {
      if (sql.includes('auth_sessions')) return { session_id: 's', id: 'u', email: 'u@x', name: 'U', platformRole: 'user', expires_at: Date.now() + 60_000 } as T;
      if (sql.includes('FROM organizations')) return organizationId === args[0] ? { id: organizationId, name: 'Org', slug: 'org', role } as T : null as T;
      if (sql.includes('COUNT(*) count')) return { count: jobs.filter((job) => job.organization_id === organizationId && ['QUEUED', 'RUNNING'].includes(job.status)).length } as T;
      if (sql.includes('FROM lead_jobs')) return jobs.find((job) => job.id === args[0] && job.organization_id === args[1]) as T ?? null;
      return null as T;
    },
    async all<T>() { if (sql.includes('FROM lead_jobs')) return { results: jobs.filter((job) => job.organization_id === args[0]) as T[] }; return { results: [] as T[] }; },
    async run() {
      if (sql.startsWith('INSERT INTO lead_jobs')) { jobs.push({ id: args[0], organization_id: args[1], type: args[2], status: args[3], progress: args[4], total: args[5], processed: args[6], succeeded: args[7], failed: args[8], metadata: args[9], error: args[10], created_at: args[11], updated_at: args[12], started_at: args[13], finished_at: args[14] }); }
      if (sql.includes("SET status='CANCELLED'")) { const job = jobs.find((item) => item.id === args[2] && item.organization_id === args[3] && ['QUEUED', 'RUNNING'].includes(item.status)); if (job) { job.status = 'CANCELLED'; job.finished_at = args[0]; job.updated_at = args[1]; return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
      if (sql.includes('UPDATE auth_sessions')) return { meta: { changes: 1 } };
      return { meta: { changes: 1 } };
    },
  }; } }; },
  };
  return { DB: db, LEAD_JOB_QUEUE: { async send() { return undefined; } }, ENVIRONMENT: 'test', APP_VERSION: 'test', __jobs: jobs } as any;
}
function request(path: string, env: any, init?: RequestInit) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...init?.headers } }), env); }
function job(id: string, organization_id = 'org-a', status = 'COMPLETED'): StoredJob { return { id, organization_id, type: 'FINDER', status, progress: 100, total: 5, processed: 5, succeeded: 4, failed: 1, metadata: JSON.stringify({ mode: 'test', limit: 5 }), error: null, created_at: 1, updated_at: 2, started_at: 1, finished_at: 2 }; }

describe('Leads job API', () => {
  it('creates a test job with variable metadata', async () => { const env = environment(); const response = await request('/leads/jobs', env, { method: 'POST', body: JSON.stringify({ type: 'FINDER', metadata: { mode: 'test', category: 'Iluminación', location: 'Córdoba', limit: 25 } }) }); expect(response.status).toBe(201); expect(env.__jobs[0]).toMatchObject({ organization_id: 'org-a', type: 'FINDER', status: 'QUEUED', total: 25 }); expect(JSON.parse(env.__jobs[0].metadata)).toMatchObject({ location: 'Córdoba' }); });
  it('enforces manage permission and validates the test-only contract', async () => { expect((await request('/leads/jobs', environment('viewer'), { method: 'POST', body: JSON.stringify({ type: 'FINDER', metadata: { mode: 'test', limit: 1 } }) })).status).toBe(403); expect((await request('/leads/jobs', environment(), { method: 'POST', body: JSON.stringify({ type: 'FINDER', metadata: { mode: 'real', limit: 1 } }) })).status).toBe(422); expect((await request('/leads/jobs', environment(), { method: 'POST', body: JSON.stringify({ type: 'UNKNOWN', metadata: { mode: 'test' } }) })).status).toBe(400); });
  it('lists and reads only jobs from the active organization', async () => { const env = environment('owner', 'org-a', [job('own'), job('foreign', 'org-b')]); const list = await request('/leads/jobs/list', env); expect(list.status).toBe(200); expect((await list.json() as { items: unknown[] }).items).toHaveLength(1); expect((await request('/leads/jobs/foreign', env)).status).toBe(404); });
  it('cancels queued jobs and rejects a completed cancellation', async () => { const env = environment('owner', 'org-a', [job('queued', 'org-a', 'QUEUED'), job('done')]); const cancelled = await request('/leads/jobs/queued/cancel', env, { method: 'POST' }); expect(cancelled.status).toBe(200); expect(env.__jobs.find((item: StoredJob) => item.id === 'queued')?.status).toBe('CANCELLED'); expect((await request('/leads/jobs/done/cancel', env, { method: 'POST' })).status).toBe(409); });
  it('enforces the active-job limit', async () => { const env = environment('owner', 'org-a', [job('a', 'org-a', 'QUEUED'), job('b', 'org-a', 'RUNNING'), job('c', 'org-a', 'QUEUED')]); const response = await request('/leads/jobs', env, { method: 'POST', body: JSON.stringify({ type: 'FINDER', metadata: { mode: 'test', limit: 1 } }) }); expect(response.status).toBe(429); });
});
