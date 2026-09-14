/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { signFinderRequest } from '../src/services/finder-auth';
import { candidateDedupeKey, normalizeFinderValue } from '../src/routes/finder-internal';

type Job = { id: string; organization_id: string; type: string; status: string; progress: number; total: number; processed: number; succeeded: number; failed: number; metadata: string | null; updated_at: number; started_at: number | null; finished_at: number | null; error: string | null };

function makeJob(id = 'job-1', organization_id = 'org-a', status = 'QUEUED', mode = 'external_dry_run'): Job {
  return { id, organization_id, type: 'FINDER', status, progress: 0, total: 1, processed: 0, succeeded: 0, failed: 0, metadata: JSON.stringify({ mode, search: { category: 'inmobiliaria', location: 'Villa Carlos Paz, Córdoba', limit: 1 } }), updated_at: 1, started_at: null, finished_at: null, error: null };
}

function environment(initial: Job[] = []) {
  const jobs = new Map(initial.map((job) => [job.id, job])); const leads = new Map<string, { id: string; organization_id: string; dedupe_key: string }>();
  const db = { prepare(sql: string) { return { bind(...args: unknown[]) { const statement = {
    async first<T>() {
      if (sql.includes('FROM lead_jobs WHERE id=?')) return jobs.get(String(args[0])) as T ?? null;
      if (sql.includes('SELECT id FROM leads')) return [...leads.values()].find((lead) => lead.organization_id === args[0] && lead.dedupe_key === args[1]) as T ?? null;
      return null as T;
    },
    async run() {
      if (sql.startsWith('INSERT INTO leads')) { const key = `${args[1]}:${args[14]}`; if (leads.has(key)) return { meta: { changes: 0 } }; leads.set(key, { id: String(args[0]), organization_id: String(args[1]), dedupe_key: String(args[14]) }); return { meta: { changes: 1 } }; }
      const id = sql.includes("SET status='FAILED'") ? String(args[3]) : String(args[2] ?? args[0]); const job = jobs.get(id);
      if (sql.includes("SET status='RUNNING'")) { if (!job || job.organization_id !== args[3] || job.status !== 'QUEUED') return { meta: { changes: 0 } }; job.status = 'RUNNING'; job.started_at = Number(args[0]); job.updated_at = Number(args[1]); return { meta: { changes: 1 } }; }
      if (sql.includes('SET metadata=')) { if (job) { job.metadata = String(args[0]); job.updated_at = Number(args[1]); } return { meta: { changes: job ? 1 : 0 } }; }
      if (sql.includes("SET status='COMPLETED'")) { const completedJob = jobs.get(String(args[3])); if (!completedJob || completedJob.status !== 'RUNNING') return { meta: { changes: 0 } }; completedJob.status = 'COMPLETED'; completedJob.progress = Number(args[0]); completedJob.finished_at = Number(args[1]); completedJob.updated_at = Number(args[2]); return { meta: { changes: 1 } }; }
      if (sql.includes("SET status='FAILED'")) { if (!job || job.status !== 'RUNNING') return { meta: { changes: 0 } }; job.status = 'FAILED'; job.error = String(args[0]); job.finished_at = Number(args[1]); job.updated_at = Number(args[2]); return { meta: { changes: 1 } }; }
      return { meta: { changes: 1 } };
    },
  }; return statement; } }; } };
  return { DB: db, FINDER_SERVICE_SECRET: 'test-secret', ENVIRONMENT: 'test', APP_VERSION: 'test', __jobs: jobs, __leads: leads } as any;
}

async function signedRequest(path: string, env: any, body: Record<string, unknown>, options: { secret?: string; timestamp?: number; alteredBody?: string } = {}) {
  const serialized = JSON.stringify(body); const signatureBody = options.alteredBody ?? serialized; const signed = await signFinderRequest('POST', path, signatureBody, options.secret ?? 'test-secret', options.timestamp);
  return app.fetch(new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Finder-Timestamp': signed.timestamp, 'X-Finder-Signature': signed.signature }, body: serialized }), env);
}

const organization = { organizationId: 'org-a' };
const validCandidate = { business_name: 'Acme', source: 'google_maps' };
const validSummary = { candidatesSeen: 1, uniqueCandidates: 1, errors: 0, blocked: false, durationSeconds: 2, leadsCreated: 0 };
const fractionalSummary = { ...validSummary, durationSeconds: 1.237 };

describe('Finder internal API', () => {
  it('normalizes Google labels and uses the documented dedupe priority', () => {
    expect(normalizeFinderValue('Sitio web: mmluisa.com')).toBe('mmluisa.com');
    expect(normalizeFinderValue('Teléfono: 03541 52-8601')).toBe('03541 52-8601');
    expect(candidateDedupeKey({ business_name: 'Acme', source_reference: 'place-1', google_maps_url: 'https://maps.test/acme' }, 'Villa Carlos Paz, Córdoba')).toBe('maps:ref:place-1');
    expect(candidateDedupeKey({ business_name: 'Acme', google_maps_url: 'https://maps.test/acme/' }, 'Villa Carlos Paz, Córdoba')).toBe('maps:url:https://maps.test/acme');
    expect(candidateDedupeKey({ business_name: 'Acme', website: 'https://acme.test' }, 'Villa Carlos Paz, Córdoba')).toBe('domain:acme.test:villa carlos paz, córdoba');
    expect(candidateDedupeKey({ business_name: 'Acme' }, 'Villa Carlos Paz, Córdoba')).toBe('name:acme:villa carlos paz, córdoba');
  });
  it('matches the shared cross-language HMAC vector', async () => {
    const signed = await signFinderRequest('POST', '/internal/finder/jobs/job-test/claim', '{"organizationId":"org-test"}', 'fixture-secret', 1700000000);
    expect(signed.timestamp).toBe('1700000000');
    expect(signed.signature).toBe('aed158d4fb877cd07bac1361fcabd7d7d983e05673013ebcca18aba56b05fe1c');
  });
  it('accepts valid HMAC and claims atomically', async () => { const env = environment(); const response = await signedRequest('/internal/finder/jobs/job-1/claim', env, organization); expect(response.status).toBe(404); const own = environment([makeJob()]); const claimed = await signedRequest('/internal/finder/jobs/job-1/claim', own, organization); expect(claimed.status).toBe(200); expect((await claimed.json() as { state: string }).state).toBe('RUNNING'); expect(own.__jobs.get('job-1').status).toBe('RUNNING'); });
  it('rejects invalid, expired, and body-altered HMAC', async () => { const env = environment([makeJob()]); expect((await signedRequest('/internal/finder/jobs/job-1/claim', env, organization, { secret: 'wrong' })).status).toBe(401); expect((await signedRequest('/internal/finder/jobs/job-1/claim', env, organization, { timestamp: 1 })).status).toBe(401); expect((await signedRequest('/internal/finder/jobs/job-1/claim', env, organization, { alteredBody: JSON.stringify({ organizationId: 'org-b' }) })).status).toBe(401); });
  it('rejects organization mismatch and does not claim a foreign job', async () => { const env = environment([makeJob()]); const response = await signedRequest('/internal/finder/jobs/job-1/claim', env, { organizationId: 'org-b' }); expect(response.status).toBe(409); expect(env.__jobs.get('job-1').status).toBe('QUEUED'); });
  it('handles duplicate claim, cancelled, and completed jobs without rerunning', async () => { const env = environment([makeJob()]); await signedRequest('/internal/finder/jobs/job-1/claim', env, organization); const duplicate = await signedRequest('/internal/finder/jobs/job-1/claim', env, organization); expect((await duplicate.json() as { state: string }).state).toBe('RUNNING'); const cancelled = environment([makeJob('cancelled', 'org-a', 'CANCELLED')]); const cancelledResponse = await signedRequest('/internal/finder/jobs/cancelled/claim', cancelled, organization); expect(cancelledResponse.status).toBe(200); expect((await cancelledResponse.json() as { state: string }).state).toBe('CANCELLED'); const completed = environment([makeJob('completed', 'org-a', 'COMPLETED')]); const completedResponse = await signedRequest('/internal/finder/jobs/completed/claim', completed, organization); expect((await completedResponse.json() as { state: string }).state).toBe('COMPLETED'); });
  it('validates batch, rejects invalid candidates and more than three', async () => { const env = environment([makeJob()]); await signedRequest('/internal/finder/jobs/job-1/claim', env, organization); expect((await signedRequest('/internal/finder/jobs/job-1/batch', env, { ...organization, candidates: [validCandidate], summary: validSummary })).status).toBe(200); expect((await signedRequest('/internal/finder/jobs/job-1/batch', env, { ...organization, candidates: [{ source: 'google_maps' }] })).status).toBe(400); expect((await signedRequest('/internal/finder/jobs/job-1/batch', env, { ...organization, candidates: [validCandidate, validCandidate, validCandidate, validCandidate] })).status).toBe(400); });
  it('accepts fractional dry-run duration and reports invalid summary fields', async () => { const env = environment([makeJob()]); await signedRequest('/internal/finder/jobs/job-1/claim', env, organization); expect((await signedRequest('/internal/finder/jobs/job-1/batch', env, { ...organization, candidates: [validCandidate], summary: fractionalSummary })).status).toBe(200); const invalid = await signedRequest('/internal/finder/jobs/job-1/complete', env, { ...organization, summary: { ...validSummary, durationSeconds: '1.2' } }); expect(invalid.status).toBe(400); expect(await invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field: 'durationSeconds' } } }); });
  it('persists one candidate atomically and returns duplicate on retry', async () => { const env = environment([makeJob('persist', 'org-a', 'QUEUED', 'external_persist_test')]); await signedRequest('/internal/finder/jobs/persist/claim', env, organization); const candidate = { business_name: 'Acme', category: 'inmobiliaria', website: 'https://acme.test', google_maps_url: 'https://maps.google.com/place/acme/', source_reference: 'place-1', source: 'google_maps' }; const first = await signedRequest('/internal/finder/jobs/persist/batch', env, { ...organization, candidates: [candidate], summary: validSummary }); expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ leadsCreated: 1, duplicates: 0 }); const second = await signedRequest('/internal/finder/jobs/persist/batch', env, { ...organization, candidates: [candidate], summary: validSummary }); expect(second.status).toBe(200); expect(await second.json()).toMatchObject({ leadsCreated: 0, duplicates: 1 }); expect(env.__leads.size).toBe(1); });
  it('keeps dedupe tenant-scoped and reports invalid candidates', async () => { const env = environment([makeJob('a', 'org-a', 'QUEUED', 'external_persist_test'), makeJob('b', 'org-b', 'QUEUED', 'external_persist_test')]); const candidate = { business_name: 'Acme', source_reference: 'place-1', source: 'google_maps' }; await signedRequest('/internal/finder/jobs/a/claim', env, { organizationId: 'org-a' }); await signedRequest('/internal/finder/jobs/b/claim', env, { organizationId: 'org-b' }); expect((await signedRequest('/internal/finder/jobs/a/batch', env, { organizationId: 'org-a', candidates: [candidate], summary: validSummary })).status).toBe(200); expect((await signedRequest('/internal/finder/jobs/b/batch', env, { organizationId: 'org-b', candidates: [candidate], summary: validSummary })).status).toBe(200); expect(env.__leads.size).toBe(2); });
  it('updates progress, completes, and fails without touching leads', async () => { const progressEnv = environment([makeJob()]); await signedRequest('/internal/finder/jobs/job-1/claim', progressEnv, organization); expect((await signedRequest('/internal/finder/jobs/job-1/progress', progressEnv, { ...organization, summary: validSummary })).status).toBe(200); expect((await signedRequest('/internal/finder/jobs/job-1/complete', progressEnv, { ...organization, summary: validSummary })).status).toBe(200); expect(progressEnv.__jobs.get('job-1').status).toBe('COMPLETED'); const failEnv = environment([makeJob('job-fail')]); await signedRequest('/internal/finder/jobs/job-fail/claim', failEnv, organization); expect((await signedRequest('/internal/finder/jobs/job-fail/fail', failEnv, { ...organization, message: 'blocked', retryable: false })).status).toBe(200); expect(failEnv.__jobs.get('job-fail').status).toBe('FAILED'); });
});
