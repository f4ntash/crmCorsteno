import { Hono } from 'hono';
import type { Env } from '../index';
import { FINDER_DRY_RUN_LIMITS, FINDER_EXTERNAL_MODE, FINDER_PERSIST_BATCH_SIZE, FINDER_PERSIST_LIMITS, FINDER_PERSIST_MODE, FINDER_PERSIST_TEST_LIMIT, FINDER_PERSIST_TEST_MODE, type FinderDiscoverySummary } from '../services/finder-contract';
import { verifyFinderSignature } from '../services/finder-auth';

type Context = { Bindings: Env };
type Job = { id: string; organization_id: string; type: string; status: string; progress: number; total: number; processed: number; succeeded: number; failed: number; metadata: string | null };
export const finderInternalRoutes = new Hono<Context>();

function error(message: string, code = 'BAD_REQUEST', details?: Record<string, unknown>) { return { error: { code, message, ...(details ? { details } : {}) } }; }
function parseBody(value: string) { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
function summary(value: unknown): { value: FinderDiscoverySummary } | { issue: string; field?: string; expected?: string; received?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { issue: 'summary must be an object', field: 'summary', expected: 'object', received: typeof value };
  const item = value as Record<string, unknown>;
  for (const field of ['candidatesSeen', 'uniqueCandidates', 'errors']) {
    const fieldValue = item[field];
    if (!Number.isInteger(fieldValue) || Number(fieldValue) < 0) return { issue: `${field} must be a non-negative integer`, field, expected: 'non-negative integer', received: typeof fieldValue };
  }
  if (typeof item.durationSeconds !== 'number' || !Number.isFinite(item.durationSeconds) || item.durationSeconds < 0) return { issue: 'durationSeconds must be a finite non-negative number', field: 'durationSeconds', expected: 'finite non-negative number', received: typeof item.durationSeconds };
  if (typeof item.blocked !== 'boolean') return { issue: 'blocked must be a boolean', field: 'blocked', expected: 'boolean', received: typeof item.blocked };
  return { value: { candidatesSeen: Number(item.candidatesSeen), uniqueCandidates: Number(item.uniqueCandidates), errors: Number(item.errors), blocked: item.blocked, durationSeconds: Number(item.durationSeconds), leadsCreated: 0 } };
}
function summaryError(result: Exclude<ReturnType<typeof summary>, { value: FinderDiscoverySummary }>) { return error(result.issue, 'VALIDATION_ERROR', { field: result.field, expected: result.expected, received: result.received }); }
async function authenticated(c: { req: { raw: Request; text: () => Promise<string> }; env: Env }, body: string) { return verifyFinderSignature(c.req.raw, body, c.env.FINDER_SERVICE_SECRET); }
async function loadJob(env: Env, jobId: string) { return env.DB.prepare('SELECT id,organization_id,type,status,progress,total,processed,succeeded,failed,metadata FROM lead_jobs WHERE id=?').bind(jobId).first<Job>(); }
function getJobSearch(job: Job) {
  let metadata: Record<string, unknown> = {};
  try { metadata = job.metadata ? JSON.parse(job.metadata) as Record<string, unknown> : {}; } catch { return null; }
  const search = metadata.search && typeof metadata.search === 'object' ? metadata.search as Record<string, unknown> : metadata;
  return typeof search.category === 'string' && typeof search.location === 'string' && Number.isInteger(search.limit)
    ? { category: search.category, location: search.location, limit: Number(search.limit) } : null;
}
function getJobMode(job: Job) { try { const metadata = job.metadata ? JSON.parse(job.metadata) as Record<string, unknown> : {}; return metadata.mode; } catch { return null; } }
function getPersistMetrics(job: Job) { try { const metadata = job.metadata ? JSON.parse(job.metadata) as Record<string, unknown> : {}; const persist = metadata.persist as Record<string, unknown> | undefined; return { requestedLeads: Number(persist?.requestedLeads ?? job.total) || job.total, leadsCreated: Number(persist?.leadsCreated) || 0, duplicates: Number(persist?.duplicates) || 0, invalidCandidates: Number(persist?.invalidCandidates) || 0, candidatesSeen: Number(persist?.candidatesSeen) || 0 }; } catch { return { requestedLeads: job.total, leadsCreated: 0, duplicates: 0, invalidCandidates: 0, candidatesSeen: 0 }; } }
export function normalizeFinderValue(value: unknown) { return typeof value === 'string' ? value.trim().replace(/^(?:sitio web|website|teléfono|telefono|phone)\s*:\s*/i, '') : ''; }
const normalized = normalizeFinderValue;
function normalizedUrl(value: string) { try { const url = new URL(value); url.hash = ''; return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/$/, '')}${url.search}`; } catch { return value.toLowerCase().replace(/\/$/, ''); } }
function normalizedDomain(value: string) { try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function locationParts(value: string) { const parts = value.split(',').map((item) => item.trim()).filter(Boolean); return { city: parts[0] ?? value, region: parts[1] ?? '', country: parts[2] ?? 'Argentina' }; }
export function candidateDedupeKey(candidate: Record<string, unknown>, location: string) {
  const sourceReference = normalized(candidate.source_reference).toLowerCase(); if (sourceReference) return `maps:ref:${sourceReference}`;
  const mapsUrl = normalizedUrl(normalized(candidate.google_maps_url)); if (mapsUrl) return `maps:url:${mapsUrl}`;
  const domain = normalizedDomain(normalized(candidate.website)); const locationKey = normalized(location).toLowerCase(); if (domain) return `domain:${domain}:${locationKey}`;
  const name = normalized(candidate.business_name).toLowerCase().replace(/\s+/g, ' '); return name && locationKey ? `name:${name}:${locationKey}` : '';
}
async function persistCandidate(env: Env, job: Job, candidate: Record<string, unknown>, search: { category: string; location: string; limit: number }) {
  const businessName = normalized(candidate.business_name); if (!businessName) return { status: 'invalid', reason: 'business_name is required' } as const;
  const location = locationParts(search.location); const website = normalized(candidate.website); const domain = normalizedDomain(website); const dedupeKey = candidateDedupeKey(candidate, search.location);
  if (!dedupeKey) return { status: 'invalid', reason: 'candidate has no stable dedupe key' } as const;
  const result = await env.DB.prepare(`INSERT INTO leads (id,organization_id,business_name,category,website,domain,city,province_state,country,address,google_maps_url,phone,source,source_reference,dedupe_key,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,dedupe_key) DO NOTHING`).bind(
    crypto.randomUUID(), job.organization_id, businessName, normalized(candidate.category) || search.category, website, domain, normalized(candidate.city) || location.city, normalized(candidate.region) || location.region, normalized(candidate.country) || location.country,
    normalized(candidate.address) || null, normalized(candidate.google_maps_url) || null, normalized(candidate.phone) || null, normalized(candidate.source).toLowerCase() || 'google_maps', normalized(candidate.source_reference) || null, dedupeKey, 'NEW', Date.now(), Date.now(),
  ).run();
  const lead = await env.DB.prepare('SELECT id FROM leads WHERE organization_id=? AND dedupe_key=?').bind(job.organization_id, dedupeKey).first<{ id: string }>();
  if (!lead) return { status: 'invalid', reason: 'lead persistence did not return a row' } as const;
  if (!result.meta.changes) await env.DB.prepare("UPDATE leads SET website=CASE WHEN website='' OR website LIKE 'Sitio web:%' THEN ? ELSE website END,domain=CASE WHEN domain='' THEN ? ELSE domain END,phone=CASE WHEN phone='' OR phone LIKE 'Teléfono:%' OR phone LIKE 'Telefono:%' THEN ? ELSE phone END,updated_at=? WHERE organization_id=? AND dedupe_key=?").bind(website, domain, normalized(candidate.phone) || null, Date.now(), job.organization_id, dedupeKey).run();
  return result.meta.changes ? { status: 'created', leadId: lead.id } as const : { status: 'duplicate', leadId: lead.id } as const;
}
async function saveSummary(env: Env, job: Job, value: FinderDiscoverySummary, extra: Record<string, unknown> = {}) {
  let metadata: Record<string, unknown> = {};
  try { metadata = job.metadata ? JSON.parse(job.metadata) as Record<string, unknown> : {}; } catch { metadata = {}; }
  const next = JSON.stringify({ ...metadata, discovery: value, ...extra });
  if (new TextEncoder().encode(next).byteLength > 8 * 1024) throw new Error('discovery summary is too large');
  await env.DB.prepare('UPDATE lead_jobs SET metadata=?,updated_at=? WHERE id=? AND organization_id=?').bind(next, Date.now(), job.id, job.organization_id).run();
}

finderInternalRoutes.post('/jobs/:id/claim', async (c) => {
  const bodyText = await c.req.text(); if (!await authenticated(c, bodyText)) return c.json(error('Invalid service authentication.', 'UNAUTHORIZED'), 401);
  const body = parseBody(bodyText); const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const job = await loadJob(c.env, c.req.param('id')); if (!job) return c.json(error('Job not found.', 'NOT_FOUND'), 404);
  if (job.organization_id !== organizationId) return c.json(error('Job organization mismatch.', 'ORGANIZATION_MISMATCH'), 409);
  if (job.type !== 'FINDER' || getJobSearch(job)?.limit === undefined) return c.json(error('Job is not a supported external Finder job.', 'INVALID_JOB'), 422);
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED') return c.json({ state: job.status, jobId: job.id });
  const result = await c.env.DB.prepare("UPDATE lead_jobs SET status='RUNNING',started_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='QUEUED'").bind(Date.now(), Date.now(), job.id, job.organization_id).run();
  if (!result.meta.changes) { const current = await loadJob(c.env, job.id); return c.json({ state: current?.status ?? 'UNKNOWN', jobId: job.id }); }
  const claimed = await loadJob(c.env, job.id); const search = claimed ? getJobSearch(claimed) : null;
  return c.json({ state: 'RUNNING', jobId: job.id, type: job.type, mode: getJobMode(job), search });
});

finderInternalRoutes.post('/jobs/:id/progress', async (c) => {
  const bodyText = await c.req.text(); if (!await authenticated(c, bodyText)) return c.json(error('Invalid service authentication.', 'UNAUTHORIZED'), 401);
  const body = parseBody(bodyText); const job = await loadJob(c.env, c.req.param('id')); if (!job) return c.json(error('Job not found.', 'NOT_FOUND'), 404);
  if (job.organization_id !== body?.organizationId) return c.json(error('Job organization mismatch.', 'ORGANIZATION_MISMATCH'), 409);
  if (job.status === 'CANCELLED') return c.json({ state: 'CANCELLED' });
  const parsed = summary(body?.summary); if (!('value' in parsed)) return c.json(summaryError(parsed), 400);
  await saveSummary(c.env, job, parsed.value); return c.json({ state: job.status });
});

finderInternalRoutes.post('/jobs/:id/batch', async (c) => {
  const bodyText = await c.req.text(); if (!await authenticated(c, bodyText)) return c.json(error('Invalid service authentication.', 'UNAUTHORIZED'), 401);
  const body = parseBody(bodyText); const job = await loadJob(c.env, c.req.param('id')); if (!job) return c.json(error('Job not found.', 'NOT_FOUND'), 404);
  if (job.organization_id !== body?.organizationId) return c.json(error('Job organization mismatch.', 'ORGANIZATION_MISMATCH'), 409);
  if (job.status === 'CANCELLED') return c.json({ state: 'CANCELLED', accepted: 0 });
  if (job.status !== 'RUNNING') return c.json(error(`Job is ${job.status}.`, 'JOB_NOT_RUNNING'), 409);
  const candidates = Array.isArray(body?.candidates) ? body.candidates : null;
  const mode = getJobMode(job);
  const batchLimit = mode === FINDER_PERSIST_MODE ? FINDER_PERSIST_BATCH_SIZE : FINDER_DRY_RUN_LIMITS.max;
  if (!candidates || candidates.length > batchLimit || candidates.some((candidate) => !candidate || typeof candidate !== 'object' || typeof (candidate as Record<string, unknown>).business_name !== 'string')) return c.json(error('Invalid Finder candidate batch.', 'VALIDATION_ERROR'), 400);
  const parsed = summary(body?.summary); if (!('value' in parsed)) return c.json(summaryError(parsed), 400);
  if (mode === FINDER_EXTERNAL_MODE) {
    await saveSummary(c.env, job, parsed.value, { lastBatchCount: candidates.length });
    return c.json({ state: 'RUNNING', accepted: candidates.length, leadsCreated: 0, duplicates: 0, invalidCandidates: 0, results: candidates.map(() => ({ status: 'accepted' })) });
  }
  if (![FINDER_PERSIST_TEST_MODE, FINDER_PERSIST_MODE].includes(mode as string)) return c.json(error('Job mode is not supported for persistence.', 'INVALID_JOB'), 422);
  const search = getJobSearch(job); if (!search || (mode === FINDER_PERSIST_TEST_MODE ? search.limit !== FINDER_PERSIST_TEST_LIMIT : !FINDER_PERSIST_LIMITS.includes(search.limit as typeof FINDER_PERSIST_LIMITS[number]))) return c.json(error('Persist job has an invalid search limit.', 'INVALID_JOB'), 422);
  const results: Array<{ status: string; leadId?: string; reason?: string }> = [];
  for (const candidate of candidates) results.push(await persistCandidate(c.env, job, candidate as Record<string, unknown>, search));
  const created = results.filter((item) => item.status === 'created').length;
  const duplicates = results.filter((item) => item.status === 'duplicate').length;
  const invalidCandidates = results.filter((item) => item.status === 'invalid').length;
  const previous = getPersistMetrics(job); const metrics = { requestedLeads: search.limit, candidatesSeen: Math.max(previous.candidatesSeen, parsed.value.candidatesSeen), leadsCreated: previous.leadsCreated + created, duplicates: previous.duplicates + duplicates, invalidCandidates: previous.invalidCandidates + invalidCandidates };
  await saveSummary(c.env, job, parsed.value, { lastBatchCount: candidates.length, persist: metrics });
  await c.env.DB.prepare("UPDATE lead_jobs SET processed=?,succeeded=?,failed=?,progress=?,updated_at=? WHERE id=? AND organization_id=? AND status='RUNNING'").bind(job.processed + candidates.length, job.succeeded + created, job.failed + invalidCandidates, Math.round((metrics.leadsCreated / Math.max(search.limit, 1)) * 100), Date.now(), job.id, job.organization_id).run();
  return c.json({ state: 'RUNNING', accepted: candidates.length, leadsCreated: created, duplicates, invalidCandidates, metrics, results });
});

finderInternalRoutes.post('/jobs/:id/complete', async (c) => {
  const bodyText = await c.req.text(); if (!await authenticated(c, bodyText)) return c.json(error('Invalid service authentication.', 'UNAUTHORIZED'), 401);
  const body = parseBody(bodyText); const job = await loadJob(c.env, c.req.param('id')); if (!job) return c.json(error('Job not found.', 'NOT_FOUND'), 404);
  if (job.organization_id !== body?.organizationId) return c.json(error('Job organization mismatch.', 'ORGANIZATION_MISMATCH'), 409);
  if (job.status === 'COMPLETED') return c.json({ state: 'COMPLETED', ...getPersistMetrics(job) });
  if (job.status === 'CANCELLED') return c.json({ state: 'CANCELLED', leadsCreated: 0 });
  const parsed = summary(body?.summary); if (!('value' in parsed)) return c.json(summaryError(parsed), 400);
  await saveSummary(c.env, job, parsed.value);
  const metrics = getPersistMetrics(job);
  const progress = getJobMode(job) === FINDER_PERSIST_MODE ? Math.round((metrics.leadsCreated / Math.max(metrics.requestedLeads, 1)) * 100) : 100;
  await c.env.DB.prepare("UPDATE lead_jobs SET status='COMPLETED',progress=?,finished_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='RUNNING'").bind(progress, Date.now(), Date.now(), job.id, job.organization_id).run();
  return c.json({ state: 'COMPLETED', ...metrics });
});

finderInternalRoutes.post('/jobs/:id/fail', async (c) => {
  const bodyText = await c.req.text(); if (!await authenticated(c, bodyText)) return c.json(error('Invalid service authentication.', 'UNAUTHORIZED'), 401);
  const body = parseBody(bodyText); const job = await loadJob(c.env, c.req.param('id')); if (!job) return c.json(error('Job not found.', 'NOT_FOUND'), 404);
  if (job.organization_id !== body?.organizationId) return c.json(error('Job organization mismatch.', 'ORGANIZATION_MISMATCH'), 409);
  const message = typeof body?.message === 'string' ? body.message.slice(0, 500) : 'External Finder failed.';
  const retryable = body?.retryable === true;
  if (!retryable && job.status === 'RUNNING') await c.env.DB.prepare("UPDATE lead_jobs SET status='FAILED',error=?,finished_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='RUNNING'").bind(message, Date.now(), Date.now(), job.id, job.organization_id).run();
  return c.json({ state: retryable ? job.status : 'FAILED', retryable });
});
