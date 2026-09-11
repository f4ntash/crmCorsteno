import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { buildAttentionItems, type AttentionExperience, type AttentionReadinessIssue } from '../services/attention';
import { getEffectiveExperienceAccessStatus } from '../services/experience-access';
import { getEffectiveExperienceStatus, type PersistedExperienceStatus } from '../services/experience-status';
import { assetReferencesBelongToOrganization, parseJson, validateRoulettePublishReadiness } from './experiences';
import { validateProductCatalogPublishReadiness } from '../services/product-catalog';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

type ExperienceRow = {
  id: string;
  name: string;
  type: string;
  status: PersistedExperienceStatus;
  draftConfig: string | null;
  publishedConfig: string | null;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | number | null;
};

type AccessPeriodRow = { experienceId: string; startsAt: string; endsAt: string };
type InventoryRow = { experienceId: string; prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null };
type ClaimRow = { experienceId: string; pendingClaims: number };

export const attentionRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
attentionRoutes.use('*', requireAuth, requireOrganization);
attentionRoutes.use('*', requireOrganizationPermission('crm.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>);

function parseLimit(value: string | undefined) {
  if (value === undefined || value === '') return 20;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : null;
}

function parseStoredJson(value: string | null) {
  if (value === null) return null;
  try { return parseJson(value); } catch { return null; }
}

function accessByExperience(rows: readonly AccessPeriodRow[]) {
  const grouped = new Map<string, AccessPeriodRow[]>();
  for (const row of rows) grouped.set(row.experienceId, [...(grouped.get(row.experienceId) ?? []), row]);
  return grouped;
}

async function readinessByExperience(db: D1Database, rows: readonly ExperienceRow[], organizationId: string) {
  const result = new Map<string, readonly AttentionReadinessIssue[]>();
  for (const row of rows) {
    if (row.type === 'product-catalog') {
      const issues = await validateProductCatalogPublishReadiness(db, row.id, organizationId, parseStoredJson(row.draftConfig));
      if (issues.length) result.set(row.id, issues);
      continue;
    }
    if (row.type !== 'roulette') continue;
    const config = parseStoredJson(row.draftConfig);
    const issues = validateRoulettePublishReadiness(config);
    if (issues.length === 0 && !assetReferencesBelongToOrganization(config, organizationId)) {
      issues.push({ code: 'ASSET_REFERENCE_INVALID', path: 'branding/prizes', message: 'Los assets deben pertenecer a la organización.' });
    }
    if (issues.length) result.set(row.id, issues);
  }
  return result;
}

function soldOutByExperience(rows: readonly ExperienceRow[], inventoryRows: readonly InventoryRow[]) {
  const inventoryByExperience = new Map<string, InventoryRow[]>();
  for (const row of inventoryRows) inventoryByExperience.set(row.experienceId, [...(inventoryByExperience.get(row.experienceId) ?? []), row]);
  const result = new Map<string, { pendingClaims: number; soldOutLimitedPrizes: number }>();
  for (const experience of rows) {
    if (experience.type !== 'roulette') continue;
    const published = parseStoredJson(experience.publishedConfig);
    const enabledPrizeIds = published && typeof published === 'object' && !Array.isArray(published) && Array.isArray((published as { prizes?: unknown }).prizes)
      ? new Set((published as { prizes: Array<{ id?: unknown; enabled?: unknown }> }).prizes.filter((prize) => typeof prize?.id === 'string' && prize.enabled !== false).map((prize) => prize.id as string))
      : new Set<string>();
    const soldOutLimitedPrizes = (inventoryByExperience.get(experience.id) ?? []).filter((item) => enabledPrizeIds.has(item.prizeId) && item.stockMode === 'limited' && (item.stockAvailable ?? 0) <= 0).length;
    result.set(experience.id, { pendingClaims: 0, soldOutLimitedPrizes });
  }
  return result;
}

attentionRoutes.get('/', async (c) => {
  const organizationId = c.get('organization').id;
  const limit = parseLimit(c.req.query('limit'));
  if (limit === null) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid attention limit' } }, 400);
  const severity = c.req.query('severity');
  if (severity !== undefined && !['info', 'warning', 'critical'].includes(severity)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid attention severity' } }, 400);
  const type = c.req.query('type');
  if (type !== undefined && !/^[a-z][a-z0-9_.-]{1,79}$/.test(type)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid attention type' } }, 400);
  const experiences = await c.env.DB.prepare('SELECT id,name,type,status,draft_config draftConfig,published_config publishedConfig,starts_at startsAt,ends_at endsAt,updated_at updatedAt FROM experiences WHERE organization_id=? ORDER BY created_at DESC,id DESC').bind(organizationId).all<ExperienceRow>();
  const [access, inventory, claims, catalogProducts] = await Promise.all([
    c.env.DB.prepare('SELECT experience_id experienceId,starts_at startsAt,ends_at endsAt FROM experience_access_periods WHERE organization_id=? ORDER BY starts_at ASC,id ASC').bind(organizationId).all<AccessPeriodRow>(),
    c.env.DB.prepare("SELECT i.experience_id experienceId,i.prize_id prizeId,i.stock_mode stockMode,i.stock_available stockAvailable FROM experience_prize_inventory i JOIN experiences e ON e.id=i.experience_id AND e.organization_id=? WHERE e.type='roulette'").bind(organizationId).all<InventoryRow>(),
    c.env.DB.prepare("SELECT experience_id experienceId,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) pendingClaims FROM roulette_prize_claims WHERE organization_id=? AND experience_id IN (SELECT id FROM experiences WHERE organization_id=? AND type='roulette') GROUP BY experience_id").bind(organizationId, organizationId).all<ClaimRow>(),
    c.env.DB.prepare("SELECT experience_id experienceId,visible,stock FROM catalog_products WHERE organization_id=? AND archived_at IS NULL").bind(organizationId).all<{ experienceId: string; visible: number; stock: number }>(),
  ]);
  const groupedAccess = accessByExperience(access.results);
  const attentionExperiences: AttentionExperience[] = experiences.results.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    effectiveStatus: getEffectiveExperienceStatus(row.status, row.startsAt, row.endsAt),
    accessStatus: getEffectiveExperienceAccessStatus(groupedAccess.get(row.id) ?? []),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    updatedAt: row.updatedAt,
  }));
  const operations = soldOutByExperience(experiences.results, inventory.results);
  for (const claim of claims.results) operations.set(claim.experienceId, { ...(operations.get(claim.experienceId) ?? { soldOutLimitedPrizes: 0 }), pendingClaims: Number(claim.pendingClaims ?? 0) });
  const catalogOperations = new Map<string, { visibleProducts: number; soldOutProducts: number }>();
  for (const experience of experiences.results) if (experience.type === 'product-catalog') catalogOperations.set(experience.id, { visibleProducts: 0, soldOutProducts: 0 });
  for (const product of catalogProducts.results) {
    const current = catalogOperations.get(product.experienceId) ?? { visibleProducts: 0, soldOutProducts: 0 };
    if (Number(product.visible) === 1) current.visibleProducts += 1;
    if (Number(product.visible) === 1 && Number(product.stock) <= 0) current.soldOutProducts += 1;
    catalogOperations.set(product.experienceId, current);
  }
  const allItems = buildAttentionItems({ organizationId, experiences: attentionExperiences, readinessByExperience: await readinessByExperience(c.env.DB, experiences.results, organizationId), rouletteOperationsByExperience: operations, catalogOperationsByExperience: catalogOperations });
  const filtered = allItems.filter((item) => (severity === undefined || item.severity === severity) && (type === undefined || item.type === type));
  return c.json({ items: filtered.slice(0, limit), total: filtered.length, limit, filters: { severity: severity ?? null, type: type ?? null } });
});
