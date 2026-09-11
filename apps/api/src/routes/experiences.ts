import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { getEffectiveExperienceStatus, type PersistedExperienceStatus } from '../services/experience-status';
import { getEffectiveExperienceAccessStatus, getExperienceAccessPeriods } from '../services/experience-access';
import { canCreateOrganizationExperience, getExperienceEntitlements, subscriptionHasFeature } from '../services/commercial-entitlements';
import { defaultExperienceType, resolveExperienceType } from '../services/experience-types';
import { normalizePrizeConfig, validDraftConfig, type DraftConfig } from '../services/roulette-config';
import { recordActivityBestEffort } from '../services/activity';
import { validateImageFile } from '../services/assets';
import { ensureExperienceAnalyticsApplication } from '../services/experience-analytics';
import { cloneCatalogProducts, publishCatalogSnapshot, PRODUCT_CATALOG_TYPE } from '../services/product-catalog';
import { createExperienceTemplateDraft, listExperienceTemplates, resolveExperienceTemplate } from '../services/experience-templates';
export { sanitizeSvg } from '../services/assets';
export { normalizeParticipationConfig, normalizePrizeConfig, validDraftConfig, validAssetUrl, validateRoulettePublishReadiness } from '../services/roulette-config';
export type { DraftConfig, ParticipationConfig, PrizeConfig, PublishReadinessIssue } from '../services/roulette-config';

const STATUSES = ['draft', 'published', 'paused'] as const;
type ExperienceStatus = PersistedExperienceStatus;
type JsonValue = Record<string, unknown> | unknown[];
export type Experience = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  type: string;
  status: ExperienceStatus;
  effective_status: string;
  schemaVersion: number;
  draftConfig: JsonValue | null;
  publishedConfig: JsonValue | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  access_status?: string;
};

export type ExperienceSpin = {
  id: string;
  experienceId: string;
  organizationId: string;
  applicationId: string | null;
  segmentId: string | null;
  segmentIndex: number;
  prizeId: string | null;
  outcomeType: 'prize' | 'no_prize';
  createdAt: string;
};

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

export const experienceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
experienceRoutes.use('*', requireAuth, requireOrganization);
experienceRoutes.use('*', async (c, next) => {
  const path = c.req.path.split('?')[0] ?? c.req.path;
  const claimOperation = (c.req.method === 'GET' && path.endsWith('/claims/lookup')) ||
    (c.req.method === 'POST' && (path.endsWith('/claims/redeem') || /\/claims\/[^/]+\/redeem$/.test(path)));
  const permission = claimOperation ? 'claims.redeem' : c.req.method === 'GET' ? 'crm.read' : 'crm.manage';
  const authorize = requireOrganizationPermission(permission) as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
  return authorize(c, next);
});
function isPlatformOperator(platformRole: string) { return ['super_admin', 'corsteno_admin'].includes(platformRole); }

function presentClaim(row: Record<string, unknown>) {
  return { id: row.id, code: row.code, prizeId: row.prizeId, prizeName: row.prizeName, status: row.status, createdAt: row.createdAt, redeemedAt: row.redeemedAt ?? null };
}

experienceRoutes.post('/claims/redeem', async (c) => {
  const organizationId = c.get('organization').id;
  const userId = c.get('user').id;
  let body: { code?: unknown };
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().replace(/\s+/g, '') : '';
  if (!code || code.length > 64) return c.json({ error: { code: 'NOT_FOUND', message: 'Código inválido.' } }, 404);
  const claim = await c.env.DB.prepare('SELECT id,experience_id experienceId,code,prize_id prizeId,prize_name prizeName,status,created_at createdAt,redeemed_at redeemedAt FROM roulette_prize_claims WHERE code=? AND organization_id=?').bind(code, organizationId).first<Record<string, unknown>>();
  if (!claim) return c.json({ error: { code: 'NOT_FOUND', message: 'Código inválido.' } }, 404);
  if (claim.status !== 'active') return c.json({ error: { code: 'CLAIM_ALREADY_REDEEMED', message: 'Este código ya fue canjeado.' } }, 409);
  const update = await c.env.DB.prepare("UPDATE roulette_prize_claims SET status='redeemed', redeemed_at=CURRENT_TIMESTAMP, redeemed_by=? WHERE id=? AND organization_id=? AND status='active'").bind(userId, claim.id, organizationId).run();
  if (!update.meta?.changes) return c.json({ error: { code: 'CLAIM_ALREADY_REDEEMED', message: 'Este código ya fue canjeado.' } }, 409);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: userId }, {
    action: 'claim.redeemed',
    resourceType: 'claim',
    resourceId: String(claim.id),
    metadata: { prizeName: claim.prizeName, claimCode: code },
  });
  return c.json({ prizeName: claim.prizeName, experienceId: claim.experienceId, status: 'redeemed', redeemedAt: new Date().toISOString() });
});

experienceRoutes.get('/claims/lookup', async (c) => {
  const code = c.req.query('code')?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
  if (!code || code.length > 64) return c.json({ error: { code: 'NOT_FOUND', message: 'Código inválido.' } }, 404);
  const claim = await c.env.DB.prepare('SELECT id,experience_id experienceId,code,prize_id prizeId,prize_name prizeName,status,created_at createdAt,redeemed_at redeemedAt FROM roulette_prize_claims WHERE code=? AND organization_id=?').bind(code, c.get('organization').id).first<Record<string, unknown>>();
  if (!claim) return c.json({ error: { code: 'NOT_FOUND', message: 'No encontramos un claim con ese código.' } }, 404);
  return c.json({ experienceId: claim.experienceId, claim: presentClaim(claim) });
});

experienceRoutes.get('/:id/claims', async (c) => {
  const experienceId = c.req.param('id');
  const organizationId = c.get('organization').id;
  const experience = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first();
  if (!experience) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const query = c.req.query();
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const values: (string | number)[] = [organizationId, experienceId];
  let where = 'organization_id=? AND experience_id=?';
  if (query.code) { where += ' AND code=?'; values.push(query.code.trim().toUpperCase()); }
  if (query.status === 'active' || query.status === 'redeemed') { where += ' AND status=?'; values.push(query.status); }
  if (query.prizeId) { where += ' AND prize_id=?'; values.push(query.prizeId); }
  const rows = await c.env.DB.prepare(`SELECT id,code,prize_id prizeId,prize_name prizeName,status,created_at createdAt,redeemed_at redeemedAt FROM roulette_prize_claims WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all<Record<string, unknown>>();
  const summary = await c.env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='redeemed' THEN 1 ELSE 0 END) redeemed FROM roulette_prize_claims WHERE ${where}`).bind(...values).first<{ total: number; redeemed: number | null }>();
  const byPrizeRows = await c.env.DB.prepare(`SELECT prize_id prizeId,COUNT(*) generated,SUM(CASE WHEN status='redeemed' THEN 1 ELSE 0 END) redeemed FROM roulette_prize_claims WHERE ${where} GROUP BY prize_id`).bind(...values).all<{ prizeId: string; generated: number; redeemed: number | null }>();
  const total = Number(summary?.total ?? rows.results.length);
  return c.json({ items: rows.results.map(presentClaim), summary: { generated: total, redeemed: Number(summary?.redeemed ?? 0), pending: Math.max(0, total - Number(summary?.redeemed ?? 0)), byPrize: Object.fromEntries(byPrizeRows.results.map((row) => [row.prizeId, { generated: Number(row.generated), redeemed: Number(row.redeemed ?? 0), pending: Math.max(0, Number(row.generated) - Number(row.redeemed ?? 0)) }])) }, pagination: { limit, offset, total, nextOffset: rows.results.length === limit ? offset + limit : null } });
});

experienceRoutes.post('/:id/claims/:claimId/redeem', async (c) => {
  const experienceId = c.req.param('id');
  const organizationId = c.get('organization').id;
  const userId = c.get('user').id;
  const experience = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first();
  if (!experience) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  if (!subscriptionHasFeature(await getExperienceEntitlements(c.env.DB, experienceId, organizationId), 'redemption_claims')) return c.json({ error: { code: 'FEATURE_NOT_AVAILABLE', message: 'Redemption claims are not included in this plan' } }, 403);
  const update = await c.env.DB.prepare("UPDATE roulette_prize_claims SET status='redeemed', redeemed_at=CURRENT_TIMESTAMP, redeemed_by=? WHERE id=? AND experience_id=? AND organization_id=? AND status='active'").bind(userId, c.req.param('claimId'), experienceId, organizationId).run();
  if (!update.meta?.changes) {
    const claim = await c.env.DB.prepare('SELECT status FROM roulette_prize_claims WHERE id=? AND experience_id=? AND organization_id=?').bind(c.req.param('claimId'), experienceId, organizationId).first<{ status: string }>();
    if (claim?.status === 'redeemed') return c.json({ error: { code: 'CONFLICT', message: 'Claim already redeemed' } }, 409);
    return c.json({ error: { code: 'NOT_FOUND', message: 'Claim not found' } }, 404);
  }
  void (async () => {
    const context = await c.env.DB.prepare('SELECT application_id applicationId FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first<{ applicationId: string | null }>();
    if (!context?.applicationId) return;
    const application = await c.env.DB.prepare('SELECT project_id projectId FROM applications WHERE id=? AND organization_id=?').bind(context.applicationId, organizationId).first<{ projectId: string }>();
    if (!application) return;
    await c.env.DB.prepare('INSERT INTO events (id,organization_id,project_id,application_id,event_name,properties,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, application.projectId, context.applicationId, 'roulette_prize_redeemed', JSON.stringify({ experienceId, claimId: c.req.param('claimId') }), Date.now(), Date.now()).run();
  })().catch(() => undefined);
  const row = await c.env.DB.prepare('SELECT id,code,prize_id prizeId,prize_name prizeName,status,created_at createdAt,redeemed_at redeemedAt FROM roulette_prize_claims WHERE id=? AND experience_id=? AND organization_id=?').bind(c.req.param('claimId'), experienceId, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: userId }, {
    action: 'claim.redeemed',
    resourceType: 'claim',
    resourceId: c.req.param('claimId'),
    metadata: { prizeName: row?.prizeName, claimCode: row?.code },
  });
  return c.json(presentClaim(row ?? {}));
});

const select = `SELECT id, organization_id organizationId, name, slug, type, status,
  application_id applicationId,
  schema_version schemaVersion, draft_config draftConfig, published_config publishedConfig,
  starts_at startsAt, ends_at endsAt, created_at createdAt, updated_at updatedAt
  FROM experiences`;

export function parseJson(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    return parsed as JsonValue;
  } catch {
    throw new Error('invalid stored JSON');
  }
}

function present(row: Record<string, unknown>): Experience {
  const startsAt = row.startsAt as string | null;
  const endsAt = row.endsAt as string | null;
  return {
    ...row,
    draftConfig: parseJson(row.draftConfig as string | null),
    publishedConfig: parseJson(row.publishedConfig as string | null),
    effective_status: getEffectiveExperienceStatus(row.status as ExperienceStatus, startsAt, endsAt),
  } as Experience;
}

async function presentWithAccess(db: D1Database, row: Record<string, unknown>, organizationId: string) {
  const experience = present(row);
  const periods = await getExperienceAccessPeriods(db, String(row.id), organizationId);
  return { ...experience, access_status: getEffectiveExperienceAccessStatus(periods) };
}

function datesValid(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  return !(startsAt && endsAt) || new Date(endsAt).getTime() > new Date(startsAt).getTime();
}

function dateValueValid(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && value.length > 0 && Number.isFinite(new Date(value).getTime()));
}

function bad(message: string) {
  return { error: { code: 'BAD_REQUEST', message } };
}
function unsupportedExperienceType() {
  return { error: { code: 'UNSUPPORTED_EXPERIENCE_TYPE', message: 'El tipo de experiencia no está soportado.' } };
}
export function assetReferencesBelongToOrganization(value: unknown, organizationId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const config = value as Record<string, unknown>;
  const refs: unknown[] = [];
  const branding = config.branding;
  if (branding && typeof branding === 'object' && !Array.isArray(branding)) refs.push((branding as Record<string, unknown>).logoUrl, (branding as Record<string, unknown>).backgroundImageUrl);
  if (Array.isArray(config.prizes)) for (const prize of config.prizes) if (prize && typeof prize === 'object' && !Array.isArray(prize)) refs.push((prize as Record<string, unknown>).iconUrl);
  const prefix = `/assets/organizations/${organizationId}/`;
  return refs.every((ref) => {
    if (typeof ref !== 'string') return true;
    try { return new URL(ref, 'http://localhost').pathname.startsWith(prefix); } catch { return false; }
  });
}

async function syncPrizeInventory(db: D1Database, experienceId: string, config: DraftConfig) {
  for (const prize of config.prizes) {
    const normalized = normalizePrizeConfig(prize);
    const current = await db.prepare('SELECT stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=? AND prize_id=?').bind(experienceId, normalized.id).first<{ stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
    if (!current) {
      const available = normalized.stockMode === 'limited' ? normalized.initialStock ?? 0 : null;
      await db.prepare('INSERT INTO experience_prize_inventory (experience_id, prize_id, stock_mode, stock_available, delivered_count) VALUES (?, ?, ?, ?, 0)').bind(experienceId, normalized.id, normalized.stockMode, available).run();
      if (normalized.stockMode === 'limited' && available !== null && available > 0) await db.prepare('INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity) VALUES (?, ?, ?, \'initial_stock\', ?)').bind(crypto.randomUUID(), experienceId, normalized.id, available).run();
    } else if (normalized.stockMode === 'unlimited') {
      await db.prepare('UPDATE experience_prize_inventory SET stock_mode=\'unlimited\', stock_available=NULL, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=?').bind(experienceId, normalized.id).run();
    } else if (current.stockMode === 'unlimited') {
      const history = await db.prepare('SELECT id FROM experience_prize_inventory_events WHERE experience_id=? AND prize_id=? LIMIT 1').bind(experienceId, normalized.id).first();
      const available = current.deliveredCount === 0 && !history ? normalized.initialStock ?? 0 : 0;
      await db.prepare('UPDATE experience_prize_inventory SET stock_mode=\'limited\', stock_available=?, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=?').bind(available, experienceId, normalized.id).run();
      if (!history && current.deliveredCount === 0 && available > 0) await db.prepare('INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity) VALUES (?, ?, ?, \'initial_stock\', ?)').bind(crypto.randomUUID(), experienceId, normalized.id, available).run();
    }
  }
}
experienceRoutes.post('/:id/assets', async (c) => {
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, c.get('organization').id).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const body = await c.req.parseBody().catch(() => null);
  const file = body && body.file instanceof File ? body.file : null;
  if (!file) return c.json(bad('A file is required'), 400);
  const validation = await validateImageFile(file, ['image/png', 'image/svg+xml']);
  if (!validation.ok) return c.json(bad(validation.message), validation.status);
  const bytes = validation.bytes;
  const extension = validation.extension;
  const key = `organizations/${c.get('organization').id}/experiences/${id}/${crypto.randomUUID()}.${extension}`;
  if (!c.env.EXPERIENCE_ASSETS) return c.json({ error: { code: 'ASSET_STORAGE_UNAVAILABLE', message: 'Asset storage is not configured' } }, 503);
  await c.env.EXPERIENCE_ASSETS.put(key, bytes, { httpMetadata: { contentType: validation.mimeType } });
  return c.json({ url: `${new URL(c.req.url).origin}/assets/${key}`, key }, 201);
});

experienceRoutes.get('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  if (row.type !== 'roulette') return c.json({ error: { code: 'NOT_FOUND', message: 'Roulette preview not found' } }, 404);
  let config: JsonValue | null;
  try { config = parseJson(row.draftConfig as string | null); } catch { config = null; }
  if (!validDraftConfig(config)) return c.json({ error: { code: 'PREVIEW_NOT_READY', message: 'El borrador todavía no está listo para probar.' } }, 422);
  const inventoryRows = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable FROM experience_prize_inventory WHERE experience_id=?').bind(id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null }>();
  const byPrize = new Map(inventoryRows.results.map((item) => [item.prizeId, item]));
  const prizeAvailability = Object.fromEntries(config.prizes.map((prize) => {
    const normalized = normalizePrizeConfig(prize);
    const inventory = byPrize.get(prize.id);
    const available = inventory?.stockMode === 'limited' ? (inventory.stockAvailable ?? 0) > 0 : normalized.stockMode !== 'limited' || (normalized.initialStock ?? 0) > 0;
    return [prize.id, available ? 'available' : 'sold_out'];
  })) as Record<string, 'available' | 'sold_out'>;
  return c.json({ config, prizeAvailability, featureEntitlements: await getExperienceEntitlements(c.env.DB, id, organizationId) });
});

experienceRoutes.post('/:id/publish', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const typeDefinition = resolveExperienceType(row.type);
  if (!typeDefinition) return c.json(unsupportedExperienceType(), 422);
  let draft: JsonValue | null;
  try { draft = parseJson(row.draftConfig as string | null); } catch { draft = null; }
  const readinessIssues = typeDefinition.validatePublishReadiness(draft);
  if (typeDefinition.validatePublishReadinessWithContext) readinessIssues.push(...await typeDefinition.validatePublishReadinessWithContext(draft, { db: c.env.DB, experienceId: id, organizationId }));
  if (readinessIssues.length === 0 && !assetReferencesBelongToOrganization(draft, organizationId)) readinessIssues.push({ code: 'ASSET_REFERENCE_INVALID', path: 'branding/prizes', message: 'Los assets deben pertenecer a la organización.' });
  if (readinessIssues.length) return c.json({ error: { code: 'PUBLISH_NOT_READY', message: 'La experiencia no está lista para publicar.', issues: readinessIssues } }, 422);
  const readyDraft = draft as DraftConfig;
  const snapshot = JSON.stringify(readyDraft);
  if (row.type === PRODUCT_CATALOG_TYPE) {
    try { await publishCatalogSnapshot(c.env.DB, id, organizationId, new URL(c.req.url).origin); } catch { return c.json({ error: { code: 'PUBLISH_FAILED', message: 'No se pudo preparar el catálogo publicado.' } }, 503); }
  }
  await c.env.DB.prepare('UPDATE experiences SET published_config=?, status=\'published\', updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?').bind(snapshot, id, organizationId).run();
  if (row.type === 'roulette') await syncPrizeInventory(c.env.DB, id, readyDraft);
  await ensureExperienceAnalyticsApplication({ db: c.env.DB, experienceId: id, organizationId, experienceType: String(row.type), name: String(row.name ?? 'Experience') });
  const published = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'experience.published', resourceType: 'experience', resourceId: id, metadata: { name: row.name } });
  try { return c.json(present(published ?? {})); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid published experience JSON' } }, 500); }
});

experienceRoutes.post('/:id/clone', async (c) => {
  const capacity = await canCreateOrganizationExperience(c.env.DB, c.get('organization').id);
  if (!capacity.allowed) return c.json({ error: { code: 'EXPERIENCE_LIMIT_REACHED', message: 'Experience limit reached', current: capacity.current, limit: capacity.limit } }, 409);
  const sourceId = c.req.param('id');
  const organizationId = c.get('organization').id;
  const source = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(sourceId, organizationId).first<Record<string, unknown>>();
  if (!source) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const typeDefinition = resolveExperienceType(source.type);
  if (!typeDefinition) return c.json(unsupportedExperienceType(), 422);
  const sourceConfig = source.draftConfig ?? source.publishedConfig;
  if (sourceConfig === null || sourceConfig === undefined) return c.json(bad('Source experience has no configuration'), 422);
  let serializedConfig: string;
  try {
    const parsed = parseJson(sourceConfig as string);
    if (!parsed) return c.json(bad('Source experience has no configuration'), 422);
    const reusableConfig = typeDefinition.normalizeDraft ? typeDefinition.normalizeDraft(parsed) : parsed;
    serializedConfig = JSON.stringify(reusableConfig);
  } catch {
    return c.json({ error: { code: 'UNPROCESSABLE_ENTITY', message: 'Source experience has invalid configuration' } }, 422);
  }
  const id = crypto.randomUUID();
  const slug = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO experiences (id, organization_id, name, slug, type, status, schema_version, draft_config, published_config, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?)`)
    .bind(id, organizationId, `${String(source.name)} - Copia`, slug, source.type, source.schemaVersion, serializedConfig, null, null).run();
  if (source.type === PRODUCT_CATALOG_TYPE) {
    try { await cloneCatalogProducts(c.env.DB, sourceId, organizationId, id); } catch {
      await c.env.DB.prepare('DELETE FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).run();
      return c.json({ error: { code: 'CLONE_FAILED', message: 'No se pudo crear la copia del catálogo.' } }, 503);
    }
  }
  const cloned = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'experience.cloned', resourceType: 'experience', resourceId: id, metadata: { name: `${String(source.name)} - Copia`, sourceName: source.name } });
  try { return c.json(present(cloned ?? {}), 201); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid cloned experience JSON' } }, 500); }
});

experienceRoutes.get('/:id/access-periods', async (c) => {
  const organizationId = c.get('organization').id;
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const periods = await getExperienceAccessPeriods(c.env.DB, id, organizationId);
  return c.json({ items: periods, status: getEffectiveExperienceAccessStatus(periods) });
});

experienceRoutes.post('/:id/access-periods', async (c) => {
  if (!['super_admin', 'corsteno_admin'].includes(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform commercial operator required' } }, 403);
  const organizationId = c.get('organization').id;
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const startsAt = body.starts_at;
  const endsAt = body.ends_at;
  if (typeof startsAt !== 'string' || typeof endsAt !== 'string' || !startsAt || !endsAt) return c.json(bad('starts_at and ends_at are required'), 400);
  const starts = new Date(startsAt).getTime();
  const ends = new Date(endsAt).getTime();
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return c.json(bad('Invalid date'), 400);
  if (starts >= ends) return c.json(bad('ends_at must be greater than starts_at'), 400);
  const source = body.source === undefined ? 'manual' : body.source;
  if (source !== 'manual') return c.json(bad('Only manual access periods are supported'), 400);
  const note = body.note === undefined || body.note === null ? null : typeof body.note === 'string' && body.note.length <= 500 ? body.note.trim() : undefined;
  if (note === undefined) return c.json(bad('note must be a string of at most 500 characters'), 400);
  const periodId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO experience_access_periods (id, experience_id, organization_id, starts_at, ends_at, source, created_by, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(periodId, id, organizationId, new Date(starts).toISOString(), new Date(ends).toISOString(), source, c.get('user').id, note).run();
  const periods = await getExperienceAccessPeriods(c.env.DB, id, organizationId);
  const period = periods.find((item) => item.id === periodId);
  return c.json({ period, status: getEffectiveExperienceAccessStatus(periods) }, 201);
});

experienceRoutes.get('/:id/inventory', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  let config: DraftConfig | null;
  try { config = parseJson(row.publishedConfig as string | null) as DraftConfig | null; } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid published experience JSON' } }, 500); }
  if (!config || !validDraftConfig(config)) return c.json({ error: { code: 'NOT_FOUND', message: 'Published inventory not found' } }, 404);
  const inventory = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=?').bind(id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
  const byPrize = new Map(inventory.results.map((item) => [item.prizeId, item]));
  return c.json({ items: config.prizes.map((prize) => { const normalized = normalizePrizeConfig(prize); const item = byPrize.get(prize.id); return { prizeId: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null, enabled: normalized.enabled, weight: normalized.weight, stockMode: item?.stockMode ?? normalized.stockMode, stockAvailable: item?.stockAvailable ?? (normalized.stockMode === 'limited' ? normalized.initialStock ?? 0 : null), deliveredCount: item?.deliveredCount ?? 0 }; }) });
});

experienceRoutes.post('/:id/inventory/:prizeId/adjust', async (c) => {
  const id = c.req.param('id'); const prizeId = c.req.param('prizeId');
  const organizationId = c.get('organization').id;
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  let body: { delta?: unknown }; try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const delta = body.delta;
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) return c.json(bad('delta must be a non-zero integer within range'), 400);
  let config: DraftConfig | null; try { config = parseJson(row.publishedConfig as string | null) as DraftConfig | null; } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid published experience JSON' } }, 500); }
  const prize = config?.prizes.find((item) => item.id === prizeId); if (!config || !validDraftConfig(config) || !prize) return c.json({ error: { code: 'NOT_FOUND', message: 'Prize not found' } }, 404);
  const inventory = await c.env.DB.prepare('SELECT stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=? AND prize_id=?').bind(id, prizeId).first<{ stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
  if (!inventory) return c.json(bad('Publish the experience before adjusting inventory'), 400);
  if (inventory.stockMode !== 'limited') return c.json(bad('Unlimited prizes do not have adjustable stock'), 400);
  const amount = Math.abs(delta);
  const update = delta > 0
    ? await c.env.DB.prepare('UPDATE experience_prize_inventory SET stock_available=stock_available+?, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=?').bind(amount, id, prizeId).run()
    : await c.env.DB.prepare('UPDATE experience_prize_inventory SET stock_available=stock_available-?, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_available>=?').bind(amount, id, prizeId, amount).run();
  if (!update.meta?.changes) return c.json(bad('Stock cannot be negative'), 400);
  await c.env.DB.prepare('INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, prizeId, delta > 0 ? 'manual_add' : 'manual_remove', amount).run();
  const current = await c.env.DB.prepare('SELECT stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=? AND prize_id=?').bind(id, prizeId).first<{ stockAvailable: number; deliveredCount: number }>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, {
    action: 'inventory.adjusted',
    resourceType: 'prize',
    resourceId: prizeId,
    metadata: { experienceName: row.name, prizeName: prize.name, delta, before: inventory.stockAvailable ?? 0, after: current?.stockAvailable ?? 0 },
  });
  return c.json({ item: { prizeId, name: prize.name, iconUrl: prize.iconUrl ?? null, enabled: normalizePrizeConfig(prize).enabled, weight: normalizePrizeConfig(prize).weight, stockMode: 'limited', stockAvailable: current?.stockAvailable ?? 0, deliveredCount: current?.deliveredCount ?? 0 } });
});

experienceRoutes.get('/templates', async (c) => {
  const type = c.req.query('type');
  return c.json(listExperienceTemplates(type));
});

experienceRoutes.post('/', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform administrator required' } }, 403);
  const capacity = await canCreateOrganizationExperience(c.env.DB, c.get('organization').id);
  if (!capacity.allowed) return c.json({ error: { code: 'EXPERIENCE_LIMIT_REACHED', message: 'Experience limit reached', current: capacity.current, limit: capacity.limit } }, 409);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = body.type === undefined ? defaultExperienceType : body.type;
  const startsAt = body.starts_at === null ? null : typeof body.starts_at === 'string' ? body.starts_at : undefined;
  const endsAt = body.ends_at === null ? null : typeof body.ends_at === 'string' ? body.ends_at : undefined;
  if (!name) return c.json(bad('name is required'), 400);
  if (typeof type !== 'string' || !datesValid(startsAt, endsAt)) return c.json(bad('ends_at must be greater than starts_at'), 400);
  const typeDefinition = resolveExperienceType(type);
  if (!typeDefinition) return c.json(unsupportedExperienceType(), 400);
  if ((startsAt && Number.isNaN(new Date(startsAt).getTime())) || (endsAt && Number.isNaN(new Date(endsAt).getTime()))) return c.json(bad('Invalid date'), 400);
  const templateId = body.template_id;
  if (templateId !== undefined && templateId !== null && typeof templateId !== 'string') return c.json(bad('template_id must be a string'), 400);
  let draftConfig: string;
  try {
    const template = templateId === undefined || templateId === null ? null : resolveExperienceTemplate(type, templateId);
    if (templateId !== undefined && templateId !== null && !template) return c.json({ error: { code: 'UNKNOWN_TEMPLATE', message: 'La plantilla no existe para este tipo de experiencia.' } }, 400);
    const requestedSegmentCount = body.segment_count;
    if (template && requestedSegmentCount !== undefined && (typeof requestedSegmentCount !== 'number' || !Number.isInteger(requestedSegmentCount) || requestedSegmentCount < 6 || requestedSegmentCount > 10)) return c.json(bad('segment_count must be an integer between 6 and 10'), 400);
    const initialConfig = template ? createExperienceTemplateDraft(template, requestedSegmentCount as number | undefined) : typeDefinition.createDraftConfig();
    if (template && !typeDefinition.validateDraft(initialConfig)) return c.json(bad('Invalid experience template configuration'), 500);
    const initialDraft = JSON.stringify(initialConfig);
    if (typeof initialDraft !== 'string') return c.json(bad('Invalid experience default configuration'), 500);
    draftConfig = initialDraft;
  } catch {
    return c.json(bad('Invalid experience default configuration'), 500);
  }
  if (body.draft_config !== undefined && (templateId === undefined || templateId === null)) {
    const normalized = typeDefinition.normalizeDraft ? typeDefinition.normalizeDraft(body.draft_config) : body.draft_config;
    if (!typeDefinition.validateDraft(normalized)) return c.json({ error: { code: 'INVALID_DRAFT_CONFIG', message: 'El borrador tiene campos inválidos.', issues: typeDefinition.validatePublishReadiness(normalized) } }, 400);
    if (!assetReferencesBelongToOrganization(normalized, c.get('organization').id)) return c.json({ error: { code: 'INVALID_DRAFT_CONFIG', message: 'Los assets deben pertenecer a la organización.', issues: [{ code: 'ASSET_REFERENCE_INVALID', path: 'branding/prizes', message: 'Los assets deben pertenecer a la organización.' }] } }, 400);
    draftConfig = JSON.stringify(normalized);
  }
  const id = crypto.randomUUID();
  const slug = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO experiences (id, organization_id, name, slug, type, status, schema_version, draft_config, published_config, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?)`)
    .bind(id, c.get('organization').id, name, slug, type, 1, draftConfig, startsAt ?? null, endsAt ?? null).run();
  await ensureExperienceAnalyticsApplication({ db: c.env.DB, experienceId: id, organizationId: c.get('organization').id, experienceType: type, name });
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, c.get('organization').id).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'experience.created', resourceType: 'experience', resourceId: id, metadata: { name, type } });
  return c.json(present(row ?? {}), 201);
});

experienceRoutes.get('/operations-summary', async (c) => {
  const organizationId = c.get('organization').id;
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const experiences = await c.env.DB.prepare('SELECT id FROM experiences WHERE organization_id=?').bind(organizationId).all<{ id: string }>();
  const [activity, claims, inventory] = await Promise.all([
    c.env.DB.prepare('SELECT e.id experienceId,COUNT(DISTINCT ev.anonymous_user_id) recentUsers,MAX(ev.occurred_at) lastActivityAt FROM experiences e LEFT JOIN events ev ON ev.application_id=e.application_id AND ev.organization_id=e.organization_id AND ev.occurred_at>=? WHERE e.organization_id=? GROUP BY e.id').bind(since, organizationId).all<{ experienceId: string; recentUsers: number; lastActivityAt: number | null }>(),
    c.env.DB.prepare("SELECT experience_id experienceId,COUNT(*) generated,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) pending FROM roulette_prize_claims WHERE organization_id=? GROUP BY experience_id").bind(organizationId).all<{ experienceId: string; generated: number; pending: number }>(),
    c.env.DB.prepare("SELECT experience_id experienceId,SUM(CASE WHEN stock_mode='limited' AND COALESCE(stock_available,0)<=0 THEN 1 ELSE 0 END) soldOutLimitedPrizes FROM experience_prize_inventory WHERE experience_id IN (SELECT id FROM experiences WHERE organization_id=?) GROUP BY experience_id").bind(organizationId).all<{ experienceId: string; soldOutLimitedPrizes: number }>(),
  ]);
  const activityById = new Map(activity.results.map((item) => [item.experienceId, item]));
  const claimsById = new Map(claims.results.map((item) => [item.experienceId, item]));
  const inventoryById = new Map(inventory.results.map((item) => [item.experienceId, item]));
  return c.json({ range: '7d', items: experiences.results.map(({ id }) => { const recent = activityById.get(id); const claim = claimsById.get(id); const stock = inventoryById.get(id); return { experienceId: id, recentUsers: Number(recent?.recentUsers ?? 0), lastActivityAt: recent?.lastActivityAt ?? null, claimsGenerated: Number(claim?.generated ?? 0), pendingClaims: Number(claim?.pending ?? 0), soldOutLimitedPrizes: Number(stock?.soldOutLimitedPrizes ?? 0) }; }) });
});

experienceRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`${select} WHERE organization_id=? ORDER BY created_at DESC`).bind(c.get('organization').id).all<Record<string, unknown>>();
  try { return c.json(await Promise.all(rows.results.map((row) => presentWithAccess(c.env.DB, row, c.get('organization').id)))); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.get('/:id/spins', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const query = c.req.query();
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const values: (string | number)[] = [organizationId, id];
  let where = 'organization_id=? AND experience_id=?';
  if (query.prizeId) { where += ' AND prize_id=?'; values.push(query.prizeId); }
  if (query.outcome) { if (query.outcome !== 'prize' && query.outcome !== 'no_prize') return c.json(bad('Invalid outcome'), 400); where += ' AND outcome_type=?'; values.push(query.outcome); }
  if (query.from) { where += ' AND created_at>=?'; values.push(query.from); }
  if (query.to) { where += ' AND created_at<=?'; values.push(query.to); }
  const rows = await c.env.DB.prepare(`SELECT id,experience_id experienceId,organization_id organizationId,application_id applicationId,segment_id segmentId,segment_index segmentIndex,prize_id prizeId,outcome_type outcomeType,created_at createdAt FROM experience_spins WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all<ExperienceSpin>();
  const total = await c.env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN outcome_type='prize' THEN 1 ELSE 0 END) prizesWon FROM experience_spins WHERE ${where}`).bind(...values).first<{ total: number; prizesWon: number | null }>();
  const byPrizeRows = await c.env.DB.prepare(`SELECT prize_id prizeId,COUNT(*) won FROM experience_spins WHERE ${where} AND outcome_type='prize' AND prize_id IS NOT NULL GROUP BY prize_id`).bind(...values).all<{ prizeId: string; won: number }>();
  const totalCount = Number(total?.total ?? rows.results.length);
  return c.json({ items: rows.results, summary: { completed: totalCount, prizesWon: Number(total?.prizesWon ?? 0), byPrize: Object.fromEntries(byPrizeRows.results.map((row) => [row.prizeId, Number(row.won)])) }, pagination: { limit, offset, total: totalCount, nextOffset: rows.results.length === limit ? offset + limit : null } });
});

experienceRoutes.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  try { return c.json(await presentWithAccess(c.env.DB, row, c.get('organization').id)); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.patch('/:id', async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const current = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const allowed: Array<[string, string]> = [['name', 'name'], ['starts_at', 'starts_at'], ['ends_at', 'ends_at'], ['status', 'status'], ['draft_config', 'draft_config']];
  const fields: string[] = [], values: unknown[] = [];
  for (const [key, column] of allowed) if (key in body) {
    if (key === 'name' && (typeof body[key] !== 'string' || !(body[key] as string).trim())) return c.json(bad('name must be a non-empty string'), 400);
    if (key === 'status' && (typeof body[key] !== 'string' || !STATUSES.includes(body[key] as ExperienceStatus))) return c.json(bad('Invalid status'), 400);
    if (key === 'draft_config') {
      const typeDefinition = resolveExperienceType(current.type);
      if (!typeDefinition) return c.json(unsupportedExperienceType(), 422);
      const normalized = typeDefinition.normalizeDraft ? typeDefinition.normalizeDraft(body[key]) : body[key];
      if (!typeDefinition.validateDraft(normalized)) return c.json({ error: { code: 'INVALID_DRAFT_CONFIG', message: 'El borrador tiene campos inválidos.', issues: typeDefinition.validatePublishReadiness(normalized) } }, 400);
      if (!assetReferencesBelongToOrganization(normalized, c.get('organization').id)) return c.json({ error: { code: 'INVALID_DRAFT_CONFIG', message: 'Los assets deben pertenecer a la organización.', issues: [{ code: 'ASSET_REFERENCE_INVALID', path: 'branding/prizes', message: 'Los assets deben pertenecer a la organización.' }] } }, 400);
      values.push(JSON.stringify(normalized));
    } else values.push(body[key]);
    fields.push(`${column}=?`);
  }
  const starts = ('starts_at' in body ? body.starts_at : current.startsAt) as string | null;
  const ends = ('ends_at' in body ? body.ends_at : current.endsAt) as string | null;
  if (!dateValueValid(starts) || !dateValueValid(ends)) return c.json(bad('Invalid date'), 400);
  if (!datesValid(starts, ends)) return c.json(bad('ends_at must be greater than starts_at'), 400);
  if (!fields.length) return c.json(bad('No editable fields provided'), 400);
  fields.push('updated_at=CURRENT_TIMESTAMP');
  await c.env.DB.prepare(`UPDATE experiences SET ${fields.join(', ')} WHERE id=? AND organization_id=?`).bind(...values, c.req.param('id'), c.get('organization').id).run();
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  const nextStatus = typeof body.status === 'string' ? body.status : current.status;
  const action = body.status !== undefined && current.status !== nextStatus ? nextStatus === 'published' ? 'experience.published' : current.status === 'published' ? 'experience.unpublished' : 'experience.updated' : 'experience.updated';
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action, resourceType: 'experience', resourceId: c.req.param('id'), metadata: { name: row?.name ?? current.name, changedFields: Object.keys(body).filter((key) => allowed.some(([allowedKey]) => allowedKey === key)), previousStatus: current.status, status: nextStatus } });
  try { return c.json(present(row ?? {})); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  await c.env.DB.prepare('DELETE FROM subscription_experiences WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM catalog_published_product_images WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM catalog_published_products WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM catalog_product_images WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM catalog_products WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM experience_access_periods WHERE experience_id=? AND organization_id=?').bind(id, organizationId).run();
  await c.env.DB.prepare('DELETE FROM experience_prize_inventory_events WHERE experience_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM experience_prize_inventory WHERE experience_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM experiences WHERE id=? AND organization_id=?').bind(id, organizationId).run();
  return c.body(null, 204);
});
