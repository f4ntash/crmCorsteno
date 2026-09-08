import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { parseJson, validDraftConfig, type DraftConfig } from './experiences';
import { buildRouletteOutcomes, secureRandomValue, selectOutcomeSegment, selectRouletteOutcome } from '../services/roulette-selector';

export const publicExperienceRoutes = new Hono<{ Bindings: Env }>();

type AnalyticsEvent = 'experience_view' | 'roulette_spin_click' | 'roulette_spin_started' | 'roulette_spin_completed';
async function ensureAnalyticsApplication(db: D1Database, experienceId: string, organizationId: string, name: string) {
  const existing = await db.prepare('SELECT application_id applicationId FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first<{ applicationId: string | null }>();
  if (existing?.applicationId) return existing.applicationId;
  const project = await db.prepare('SELECT id FROM projects WHERE organization_id=? ORDER BY created_at LIMIT 1').bind(organizationId).first<{ id: string }>();
  if (!project) return null;
  const applicationId = crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO applications (id, organization_id, project_id, name, slug, status, application_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 'roulette', ?, ?)").bind(applicationId, organizationId, project.id, name, `roulette-${experienceId}`, Date.now(), Date.now()).run();
  const actual = await db.prepare('SELECT id FROM applications WHERE organization_id=? AND project_id=? AND slug=?').bind(organizationId, project.id, `roulette-${experienceId}`).first<{ id: string }>();
  if (!actual) return null;
  await db.prepare('UPDATE experiences SET project_id=?, application_id=? WHERE id=? AND organization_id=?').bind(project.id, actual.id, experienceId, organizationId).run();
  return actual.id;
}
async function recordExperienceEvent(db: D1Database, experienceId: string, organizationId: string, name: string, event: string, userId: string | null, sessionId: string | null, properties: Record<string, unknown> = {}) {
  const applicationId = await ensureAnalyticsApplication(db, experienceId, organizationId, name);
  if (!applicationId) return;
  const app = await db.prepare('SELECT project_id projectId FROM applications WHERE id=? AND organization_id=?').bind(applicationId, organizationId).first<{ projectId: string }>();
  if (!app) return;
  await db.prepare('INSERT INTO events (id,organization_id,project_id,application_id,event_name,anonymous_user_id,session_id,properties,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, app.projectId, applicationId, event, userId, sessionId, JSON.stringify(properties), Date.now(), Date.now()).run();
}

publicExperienceRoutes.get('/experiences/:slug', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,draft_config,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; status: string; draft_config: string | null; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);
  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  let config: unknown;
  try { config = parseJson(row.published_config); } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  if (!config || !validDraftConfig(config)) return c.json({ active: false, reason: 'unavailable' }, 503);
  return c.json({ active: true, experience: { id: row.id, type: row.type, config, startsAt: row.starts_at, endsAt: row.ends_at } });
});

publicExperienceRoutes.post('/experiences/:slug/spin', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; status: string; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);
  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  if (row.type !== 'roulette') return c.json({ active: false, reason: 'unavailable' }, 503);
  let config: DraftConfig | null;
  try { config = parseJson(row.published_config) as DraftConfig | null; } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  if (!config || !validDraftConfig(config)) return c.json({ active: false, reason: 'unavailable' }, 503);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inventoryRows = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=?').bind(row.id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
    const inventory = new Map(inventoryRows.results.map((item) => [item.prizeId, item]));
    const outcomes = buildRouletteOutcomes(config, inventory);
    if (!outcomes.length) return c.json({ active: false, reason: 'unavailable' });
    const outcome = selectRouletteOutcome(outcomes, secureRandomValue());
    if (outcome.prizeId !== null) {
      const prize = config.prizes.find((item) => item.id === outcome.prizeId)!;
      const stock = inventory.get(prize.id);
      const stockMode = stock?.stockMode ?? (prize.stockMode ?? (prize.stockLimit == null ? 'unlimited' : 'limited'));
      const spinId = crypto.randomUUID();
      if (!stock && stockMode === 'unlimited') await c.env.DB.prepare('INSERT OR IGNORE INTO experience_prize_inventory (experience_id, prize_id, stock_mode, stock_available, delivered_count) VALUES (?, ?, \'unlimited\', NULL, 0)').bind(row.id, prize.id).run();
      const update = stockMode === 'limited'
        ? await c.env.DB.prepare('UPDATE experience_prize_inventory SET stock_available=stock_available-1, delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_available>0').bind(row.id, prize.id).run()
        : await c.env.DB.prepare("UPDATE experience_prize_inventory SET delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_mode='unlimited'").bind(row.id, prize.id).run();
      if (!update.meta?.changes) continue;
      await c.env.DB.prepare('INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity, spin_id) VALUES (?, ?, ?, \'prize_delivered\', 1, ?)').bind(crypto.randomUUID(), row.id, prize.id, spinId).run();
      await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_prize_won', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, prize: prize.name, prizeId: prize.id, spinId });
      const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
      const segment = config.segments[segmentIndex]!;
      const prizeResult = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
      await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_completed', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, spinId, prize: prize.name, prizeId: prize.id });
      return c.json({ spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prizeResult ? { id: prizeResult.id, name: prizeResult.name, iconUrl: prizeResult.iconUrl ?? null } : null });
    }
    const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
    const segment = config.segments[segmentIndex]!;
    const prize = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
    const spinId = crypto.randomUUID();
    await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_completed', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, spinId, result: 'no_prize', prize: 'Sin premio' });
    await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_no_prize', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, spinId, prize: 'Sin premio' });
    return c.json({ spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null });
  }
  return c.json({ active: false, reason: 'unavailable' }, 503);
});

publicExperienceRoutes.post('/experiences/:slug/events', async (c) => {
  const row = await c.env.DB.prepare('SELECT id,organization_id,name FROM experiences WHERE slug=? AND status=\'published\'').bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string }>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const body = await c.req.json().catch(() => ({} as { event?: string; userId?: string; sessionId?: string; properties?: Record<string, unknown> }));
  const event = body.event as AnalyticsEvent;
  if (!['experience_view', 'roulette_spin_click', 'roulette_spin_started', 'roulette_spin_completed'].includes(event)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid experience event' } }, 400);
  if (body.userId && body.userId.length > 200 || body.sessionId && body.sessionId.length > 200) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid anonymous identifiers' } }, 400);
  await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, event, body.userId ?? null, body.sessionId ?? null, body.properties ?? { experienceId: row.id });
  return c.json({ ok: true }, 201);
});
