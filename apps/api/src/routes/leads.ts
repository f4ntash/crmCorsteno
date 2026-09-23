import { Hono } from 'hono';
import { FINDER_LOCATION_MIN_LENGTH } from '@corsteno/types';
import { createMiddleware } from 'hono/factory';
import { requireAuth, requireInternalOrOrganization, requireOrganizationPermission, requirePlatformOperator } from '../auth/middleware';
import type { Env } from '../index';
import { LEAD_JOB_LIMITS, LEAD_JOB_TYPES } from '../services/lead-jobs';
import type { LeadJobMessage } from '../services/lead-queue';
import { recordActivityBestEffort } from '../services/activity';
import { FINDER_DRY_RUN_LIMITS, FINDER_EXTERNAL_MODE, FINDER_PERSIST_LIMITS, FINDER_PERSIST_MODE, FINDER_PERSIST_TEST_LIMIT, FINDER_PERSIST_TEST_MODE, FINDER_CATEGORIES, type FinderJobMessage } from '../services/finder-contract';

type Variables = { user: { id: string; platformRole: string }; organization: { id: string; role: string } };
type LeadContext = { Bindings: Env; Variables: Variables };
export const leadRoutes = new Hono<LeadContext>();
leadRoutes.use('*', requireAuth, requireInternalOrOrganization, requirePlatformOperator);
const read = requireOrganizationPermission('crm.read') as unknown as ReturnType<typeof createMiddleware<LeadContext>>;
const manage = requireOrganizationPermission('crm.manage') as unknown as ReturnType<typeof createMiddleware<LeadContext>>;

const statuses = ['NEW', 'ENRICHING', 'QUALIFIED', 'TO_CONTACT', 'CONTACTED', 'REPLIED', 'MEETING', 'OPPORTUNITY', 'WON', 'LOST'];
const allowed = ['businessName', 'category', 'subcategory', 'description', 'website', 'city', 'provinceState', 'country', 'address', 'googleMapsUrl', 'instagramUrl', 'linkedinUrl', 'phone', 'contactName', 'contactRole', 'contactEmail', 'source', 'sourceReference', 'score', 'recommendedOffer', 'recommendedDemo', 'status', 'notes', 'lastContactAt', 'nextActionAt'];
const columns: Record<string, string> = { businessName: 'business_name', category: 'category', subcategory: 'subcategory', description: 'description', website: 'website', city: 'city', provinceState: 'province_state', country: 'country', address: 'address', googleMapsUrl: 'google_maps_url', instagramUrl: 'instagram_url', linkedinUrl: 'linkedin_url', phone: 'phone', contactName: 'contact_name', contactRole: 'contact_role', contactEmail: 'contact_email', source: 'source', sourceReference: 'source_reference', score: 'score', recommendedOffer: 'recommended_offer', recommendedDemo: 'recommended_demo', status: 'status', notes: 'notes', lastContactAt: 'last_contact_at', nextActionAt: 'next_action_at' };
const leadSortColumns: Record<string, string> = {
  updated_desc: 'updated_at DESC, id DESC',
  updated_asc: 'updated_at ASC, id ASC',
  score_desc: 'score DESC NULLS LAST, updated_at DESC, id DESC',
  score_asc: 'score ASC NULLS LAST, updated_at DESC, id DESC',
  business_name_asc: 'business_name COLLATE NOCASE ASC, id ASC',
  business_name_desc: 'business_name COLLATE NOCASE DESC, id DESC',
};
const select = `id, business_name businessName, category, subcategory, description, website, domain, city, province_state provinceState, country, address, google_maps_url googleMapsUrl, instagram_url instagramUrl, linkedin_url linkedinUrl, phone, contact_name contactName, contact_role contactRole, contact_email contactEmail, source, source_reference sourceReference, score, recommended_offer recommendedOffer, recommended_demo recommendedDemo, status, notes, last_contact_at lastContactAt, next_action_at nextActionAt, archived_at archivedAt, created_at createdAt, updated_at updatedAt`;
const jobSelect = 'id,type,status,progress,total,processed,succeeded,failed,metadata,error,created_at createdAt,updated_at updatedAt,started_at startedAt,finished_at finishedAt';
function jsonError(message: string, code = 'BAD_REQUEST') { return { error: { code, message } }; }
function textValue(value: unknown, fallback = '') { return typeof value === 'string' ? value.trim() : fallback; }
function nullable(value: unknown) { const result = textValue(value); return result || null; }
function normalizeDomain(value: string) { try { const url = new URL(value.includes('://') ? value : `https://${value}`); return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''); } catch { return (value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? '').replace(/^www\./, '').trim(); } }
function manualDedupeKey(domain: string, email: unknown) { const normalizedDomain = domain.trim().toLowerCase(); if (normalizedDomain) return `manual:domain:${normalizedDomain}`; const normalizedEmail = textValue(email).toLowerCase(); return normalizedEmail ? `manual:email:${normalizedEmail}` : null; }
function dateValue(value: unknown) { if (value === null || value === undefined || value === '') return null; const result = typeof value === 'number' ? value : Date.parse(String(value)); return Number.isFinite(result) ? result : null; }
function mapInput(value: Record<string, unknown>, partial = false) {
  const result: Record<string, unknown> = {};
  for (const key of allowed) if (!partial || key in value) result[key] = value[key];
  for (const key of ['businessName', 'category', 'website', 'city', 'provinceState', 'country', 'source']) if (!partial || key in value) result[key] = textValue(result[key]);
  for (const key of ['subcategory', 'description', 'address', 'googleMapsUrl', 'instagramUrl', 'linkedinUrl', 'phone', 'contactName', 'contactRole', 'contactEmail', 'sourceReference', 'recommendedOffer', 'recommendedDemo', 'notes']) if (!partial || key in value) result[key] = nullable(result[key]);
  if (!partial || 'score' in value) result.score = value.score === null || value.score === '' || value.score === undefined ? null : Number(value.score);
  if (!partial || 'lastContactAt' in value) result.lastContactAt = dateValue(value.lastContactAt);
  if (!partial || 'nextActionAt' in value) result.nextActionAt = dateValue(value.nextActionAt);
  if (!partial || 'status' in value) result.status = textValue(value.status, 'NEW').toUpperCase();
  return result;
}
function outputRow(row: Record<string, unknown>) { return row; }
function finderCategoryLabel(value: string) { return value.split(' ').map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(' '); }

leadRoutes.get('/', read, async (c) => {
  const org = c.get('organization').id; const q = c.req.query(); const archive = q.archive ?? 'active'; if (!['active', 'archived', 'all'].includes(archive)) return c.json(jsonError('El filtro de archivado no es válido.', 'VALIDATION_ERROR'), 400); const values: (string | number)[] = [org]; const where = ['organization_id=?']; const archiveWhere = ['organization_id=?'];
  const sort = q.sort ?? 'updated_desc'; if (!Object.prototype.hasOwnProperty.call(leadSortColumns, sort)) return c.json(jsonError('El orden solicitado no es válido.', 'VALIDATION_ERROR'), 400);
  if (archive === 'active') { where.push('archived_at IS NULL'); archiveWhere.push('archived_at IS NULL'); } else if (archive === 'archived') { where.push('archived_at IS NOT NULL'); archiveWhere.push('archived_at IS NOT NULL'); }
  if (q.search?.trim()) { where.push('(business_name LIKE ? OR domain LIKE ? OR contact_name LIKE ? OR contact_email LIKE ?)'); const term = `%${q.search.trim()}%`; values.push(term, term, term, term); }
  if (q.category) { where.push('category=?'); values.push(q.category); } if (q.city) { where.push('city=?'); values.push(q.city); } if (q.status) { where.push('status=?'); values.push(q.status); } if (q.offer) { where.push('recommended_offer=?'); values.push(q.offer); }
  if (q.minScore && Number.isFinite(Number(q.minScore))) { where.push('score>=?'); values.push(Number(q.minScore)); } if (q.maxScore && Number.isFinite(Number(q.maxScore))) { where.push('score<=?'); values.push(Number(q.maxScore)); }
  if (q.createdFrom) { const date = dateValue(q.createdFrom); if (date) { where.push('created_at>=?'); values.push(date); } } if (q.createdTo) { const date = dateValue(q.createdTo); if (date) { where.push('created_at<=?'); values.push(date + 86_399_999); } }
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 250); const offset = Math.max(Number(q.offset) || 0, 0);
  const facetWhere = archiveWhere.join(' AND ');
  const [rows, total, counts, jobs, categories, offers] = await Promise.all([
    c.env.DB.prepare(`SELECT ${select} FROM leads WHERE ${where.join(' AND ')} ORDER BY ${leadSortColumns[sort]} LIMIT ? OFFSET ?`).bind(...values, limit, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) total FROM leads WHERE ${where.join(' AND ')}`).bind(...values).first<{ total: number }>(),
    c.env.DB.prepare(`SELECT status,COUNT(*) count FROM leads WHERE ${archiveWhere.join(' AND ')} GROUP BY status`).bind(...([org] as (string | number)[])).all<{ status: string; count: number }>(),
    c.env.DB.prepare(`SELECT ${jobSelect} FROM lead_jobs WHERE organization_id=? ORDER BY created_at DESC LIMIT 20`).bind(org).all(),
    c.env.DB.prepare(`SELECT DISTINCT category FROM leads WHERE ${facetWhere} AND category <> '' ORDER BY category COLLATE NOCASE ASC`).bind(org).all<{ category: string }>(),
    c.env.DB.prepare(`SELECT DISTINCT recommended_offer recommendedOffer FROM leads WHERE ${facetWhere} AND recommended_offer IS NOT NULL AND recommended_offer <> '' ORDER BY recommended_offer COLLATE NOCASE ASC`).bind(org).all<{ recommendedOffer: string }>(),
  ]);
  const countMap = Object.fromEntries(counts.results.map((item) => [item.status, item.count]));
  return c.json({ items: rows.results.map(outputRow), total: total?.total ?? 0, kpis: { total: Object.values(countMap).reduce((a, b) => a + Number(b), 0), new: countMap.NEW ?? 0, qualified: countMap.QUALIFIED ?? 0, toContact: countMap.TO_CONTACT ?? 0, replied: countMap.REPLIED ?? 0, meetings: countMap.MEETING ?? 0, opportunities: countMap.OPPORTUNITY ?? 0 }, facets: { categories: categories.results.map((item) => item.category), offers: offers.results.map((item) => item.recommendedOffer) }, jobs: jobs.results });
});

leadRoutes.get('/finder/categories', read, (c) => c.json({ items: FINDER_CATEGORIES.map((value) => ({ value, label: finderCategoryLabel(value) })) }));

leadRoutes.get('/:id', read, async (c) => { const org = c.get('organization').id; const lead = await c.env.DB.prepare(`SELECT ${select} FROM leads WHERE id=? AND organization_id=?`).bind(c.req.param('id'), org).first(); if (!lead) return c.json(jsonError('Lead no encontrado.', 'NOT_FOUND'), 404); const jobs = await c.env.DB.prepare('SELECT id,type,status,progress,total,processed,succeeded,failed,metadata,error,created_at createdAt,started_at startedAt,finished_at finishedAt FROM lead_jobs WHERE organization_id=? ORDER BY created_at DESC LIMIT 20').bind(org).all(); return c.json({ lead, jobs: jobs.results }); });

leadRoutes.get('/jobs/list', read, async (c) => c.json({ items: (await c.env.DB.prepare(`SELECT ${jobSelect} FROM lead_jobs WHERE organization_id=? ORDER BY created_at DESC LIMIT 50`).bind(c.get('organization').id).all()).results }));

leadRoutes.post('/jobs', manage, async (c) => {
  const body = await c.req.json().catch(() => null) as { type?: unknown; metadata?: unknown } | null;
  if (!body || typeof body.type !== 'string' || !LEAD_JOB_TYPES.includes(body.type as typeof LEAD_JOB_TYPES[number])) return c.json(jsonError('El tipo de job no es válido.', 'VALIDATION_ERROR'), 400);
  if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) return c.json(jsonError('La metadata debe ser un objeto.', 'VALIDATION_ERROR'), 400);
  const metadata = body.metadata as Record<string, unknown>;
  const external = body.type === 'FINDER' && [FINDER_EXTERNAL_MODE, FINDER_PERSIST_TEST_MODE, FINDER_PERSIST_MODE].includes(metadata.mode as string);
  const persistTest = external && metadata.mode === FINDER_PERSIST_TEST_MODE;
  const persist = external && metadata.mode === FINDER_PERSIST_MODE;
  if (body.type !== 'FINDER' || (!external && metadata.mode !== 'test')) return c.json(jsonError('El modo de job no está disponible.', 'JOB_HANDLER_UNAVAILABLE'), 422);
  const limit = Number(metadata.limit ?? (external ? FINDER_DRY_RUN_LIMITS.min : LEAD_JOB_LIMITS.testDefaultSteps));
  const maxLimit = persistTest ? FINDER_PERSIST_TEST_LIMIT : persist ? 25 : external ? FINDER_DRY_RUN_LIMITS.max : LEAD_JOB_LIMITS.maxBatchSize;
  if (persist && !FINDER_PERSIST_LIMITS.includes(limit as typeof FINDER_PERSIST_LIMITS[number])) return c.json(jsonError('La cantidad debe ser 5, 10 o 25.', 'VALIDATION_ERROR'), 400);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) return c.json(jsonError(`El límite debe ser un entero entre 1 y ${maxLimit}.`, 'VALIDATION_ERROR'), 400);
  const finderLocation = typeof metadata.location === 'string' ? metadata.location.trim() : '';
  if (external && (typeof metadata.category !== 'string' || !FINDER_CATEGORIES.includes(metadata.category.trim().toLowerCase() as typeof FINDER_CATEGORIES[number]))) return c.json(jsonError('La categoría del Finder externo es obligatoria y debe ser válida.', 'VALIDATION_ERROR'), 400);
  if (external && finderLocation.length < FINDER_LOCATION_MIN_LENGTH) return c.json(jsonError(`La ubicación debe tener al menos ${FINDER_LOCATION_MIN_LENGTH} caracteres.`, 'VALIDATION_ERROR'), 400);
  const normalizedMetadata = external ? { mode: persistTest ? FINDER_PERSIST_TEST_MODE : persist ? FINDER_PERSIST_MODE : FINDER_EXTERNAL_MODE, search: { category: String(metadata.category).trim().toLowerCase(), location: finderLocation, limit } } : { ...metadata, limit };
  const serialized = JSON.stringify(normalizedMetadata);
  if (new TextEncoder().encode(serialized).byteLength > LEAD_JOB_LIMITS.maxMetadataBytes) return c.json(jsonError('La metadata del job es demasiado grande.', 'PAYLOAD_TOO_LARGE'), 413);
  const organizationId = c.get('organization').id; const active = await c.env.DB.prepare("SELECT COUNT(*) count FROM lead_jobs WHERE organization_id=? AND status IN ('QUEUED','RUNNING')").bind(organizationId).first<{ count: number }>();
  if (Number(active?.count ?? 0) >= LEAD_JOB_LIMITS.maxActivePerOrganization) return c.json(jsonError('La organización ya tiene el máximo de jobs activos.', 'JOB_LIMIT_REACHED'), 429);
  if (external && !c.env.FINDER_JOB_QUEUE) return c.json(jsonError('El Finder externo no está configurado.', 'QUEUE_UNAVAILABLE'), 503);
  const now = Date.now(); const id = crypto.randomUUID(); await c.env.DB.prepare('INSERT INTO lead_jobs (id,organization_id,type,status,progress,total,processed,succeeded,failed,metadata,error,created_at,updated_at,started_at,finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, body.type, 'QUEUED', 0, limit, 0, 0, 0, serialized, null, now, now, null, null).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'lead_job.created', resourceType: 'lead_job', resourceId: id, metadata: { type: body.type, limit } });
  try {
    if (external) await c.env.FINDER_JOB_QUEUE?.send({ version: 1, jobId: id, organizationId } satisfies FinderJobMessage);
    else await c.env.LEAD_JOB_QUEUE.send({ version: 1, jobId: id, organizationId } satisfies LeadJobMessage);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 300) : 'No se pudo publicar el job.';
    await c.env.DB.prepare("UPDATE lead_jobs SET status='FAILED', error=?, finished_at=?, updated_at=? WHERE id=? AND organization_id=? AND status='QUEUED'").bind(message, Date.now(), Date.now(), id, organizationId).run();
    await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'lead_job.enqueue_failed', resourceType: 'lead_job', resourceId: id, metadata: { type: body.type } });
    return c.json(jsonError('No se pudo poner el proceso en cola. Intentá nuevamente.', 'QUEUE_UNAVAILABLE'), 503);
  }
  return c.json(await c.env.DB.prepare(`SELECT ${jobSelect} FROM lead_jobs WHERE id=? AND organization_id=?`).bind(id, organizationId).first(), 201);
});

leadRoutes.get('/jobs/:id', read, async (c) => { const job = await c.env.DB.prepare(`SELECT ${jobSelect} FROM lead_jobs WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first(); return job ? c.json(job) : c.json(jsonError('Job no encontrado.', 'NOT_FOUND'), 404); });

leadRoutes.post('/jobs/:id/cancel', manage, async (c) => { const organizationId = c.get('organization').id; const id = c.req.param('id'); const result = await c.env.DB.prepare("UPDATE lead_jobs SET status='CANCELLED', finished_at=?, updated_at=? WHERE id=? AND organization_id=? AND status IN ('QUEUED','RUNNING')").bind(Date.now(), Date.now(), id, organizationId).run(); if (!result.meta.changes) { const existing = await c.env.DB.prepare('SELECT status FROM lead_jobs WHERE id=? AND organization_id=?').bind(id, organizationId).first<{ status: string }>(); if (!existing) return c.json(jsonError('Job no encontrado.', 'NOT_FOUND'), 404); return c.json(jsonError(`El job no se puede cancelar en estado ${existing.status}.`, 'JOB_NOT_CANCELLABLE'), 409); } await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'lead_job.cancelled', resourceType: 'lead_job', resourceId: id, metadata: {} }); return c.json(await c.env.DB.prepare(`SELECT ${jobSelect} FROM lead_jobs WHERE id=? AND organization_id=?`).bind(id, organizationId).first()); });

leadRoutes.post('/', manage, async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null; if (!body) return c.json(jsonError('El cuerpo no es válido.'), 400); const value = mapInput(body); const required = ['businessName', 'category', 'website', 'city', 'provinceState', 'country', 'source']; if (required.some((key) => !value[key])) return c.json(jsonError('Completá los campos obligatorios.'), 400); if (!statuses.includes(String(value.status)) || (value.score !== null && (!Number.isInteger(value.score) || Number(value.score) < 0 || Number(value.score) > 100))) return c.json(jsonError('Revisá estado y score.'), 400);
  const org = c.get('organization').id; const domain = normalizeDomain(String(value.website));
  // Manual leads use stable identifiers only: normalized domain, then email as a fallback.
  // The API guard also compares exact Google Maps URLs so manual and Finder records cross-check safely.
  const duplicate = await c.env.DB.prepare('SELECT id,business_name businessName FROM leads WHERE organization_id=? AND (domain=? OR (contact_email IS NOT NULL AND contact_email=? AND contact_email <> \'\') OR (google_maps_url IS NOT NULL AND google_maps_url=? AND google_maps_url <> \'\')) LIMIT 1').bind(org, domain, value.contactEmail ?? '', value.googleMapsUrl ?? '').first(); if (duplicate) return c.json({ error: { code: 'DUPLICATE_LEAD', message: 'Ya existe un lead con el mismo dominio, email o ubicación.', duplicate } }, 409);
  const now = Date.now(); const id = crypto.randomUUID(); const dedupeKey = manualDedupeKey(domain, value.contactEmail); const fields = ['id', 'organization_id', 'domain', 'dedupe_key', ...Object.keys(value).map((key) => columns[key]).filter(Boolean), 'created_at', 'updated_at']; const vals = [id, org, domain, dedupeKey, ...Object.keys(value).filter((key) => columns[key]).map((key) => value[key] ?? null), now, now]; await c.env.DB.prepare(`INSERT INTO leads (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).bind(...vals as (string | number | null)[]).run(); const created = await c.env.DB.prepare(`SELECT ${select} FROM leads WHERE id=? AND organization_id=?`).bind(id, org).first(); return c.json(created, 201);
});

leadRoutes.patch('/:id', manage, async (c) => { const body = await c.req.json().catch(() => null) as Record<string, unknown> | null; if (!body) return c.json(jsonError('El cuerpo no es válido.'), 400); const org = c.get('organization').id; const current = await c.env.DB.prepare('SELECT id,website FROM leads WHERE id=? AND organization_id=?').bind(c.req.param('id'), org).first<{ id: string; website: string }>(); if (!current) return c.json(jsonError('Lead no encontrado.', 'NOT_FOUND'), 404); const value = mapInput(body, true); if ('status' in value && !statuses.includes(String(value.status))) return c.json(jsonError('Estado inválido.'), 400); if ('score' in value && value.score !== null && (!Number.isInteger(value.score) || Number(value.score) < 0 || Number(value.score) > 100)) return c.json(jsonError('El score debe estar entre 0 y 100.'), 400); if (!Object.keys(value).length) return c.json(jsonError('No hay cambios para guardar.'), 400); const sets = Object.keys(value).filter((key) => columns[key]).map((key) => `${columns[key]}=?`); const vals = Object.keys(value).filter((key) => columns[key]).map((key) => value[key] ?? null); if ('website' in value) { sets.push('domain=?'); vals.push(normalizeDomain(String(value.website))); } sets.push('updated_at=?'); vals.push(Date.now()); await c.env.DB.prepare(`UPDATE leads SET ${sets.join(',')} WHERE id=? AND organization_id=?`).bind(...vals as (string | number | null)[], current.id, org).run(); return c.json(await c.env.DB.prepare(`SELECT ${select} FROM leads WHERE id=? AND organization_id=?`).bind(current.id, org).first()); });

leadRoutes.post('/:id/archive', manage, async (c) => { const org = c.get('organization').id; const id = c.req.param('id'); const now = Date.now(); const result = await c.env.DB.prepare('UPDATE leads SET archived_at=?, updated_at=? WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(now, now, id, org).run(); if (!result.meta.changes) { const existing = await c.env.DB.prepare('SELECT id,archived_at archivedAt FROM leads WHERE id=? AND organization_id=?').bind(id, org).first<{ id: string; archivedAt: number | null }>(); if (!existing) return c.json(jsonError('Lead no encontrado.', 'NOT_FOUND'), 404); return c.json(jsonError('El lead ya está archivado.', 'ALREADY_ARCHIVED'), 409); } await recordActivityBestEffort(c.env.DB, { organizationId: org, actorUserId: c.get('user').id }, { action: 'lead.archived', resourceType: 'lead', resourceId: id, metadata: {} }); return c.json(await c.env.DB.prepare(`SELECT ${select} FROM leads WHERE id=? AND organization_id=?`).bind(id, org).first()); });

leadRoutes.post('/:id/restore', manage, async (c) => { const org = c.get('organization').id; const id = c.req.param('id'); const now = Date.now(); const result = await c.env.DB.prepare('UPDATE leads SET archived_at=NULL, updated_at=? WHERE id=? AND organization_id=? AND archived_at IS NOT NULL').bind(now, id, org).run(); if (!result.meta.changes) { const existing = await c.env.DB.prepare('SELECT id,archived_at archivedAt FROM leads WHERE id=? AND organization_id=?').bind(id, org).first<{ id: string; archivedAt: number | null }>(); if (!existing) return c.json(jsonError('Lead no encontrado.', 'NOT_FOUND'), 404); return c.json(jsonError('El lead ya está activo.', 'ALREADY_ACTIVE'), 409); } await recordActivityBestEffort(c.env.DB, { organizationId: org, actorUserId: c.get('user').id }, { action: 'lead.restored', resourceType: 'lead', resourceId: id, metadata: {} }); return c.json(await c.env.DB.prepare(`SELECT ${select} FROM leads WHERE id=? AND organization_id=?`).bind(id, org).first()); });
