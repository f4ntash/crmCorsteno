import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { getEffectiveExperienceAccessStatus, getExperienceAccessPeriods } from '../services/experience-access';
import { normalizeParticipationConfig, parseJson, validDraftConfig, type DraftConfig } from './experiences';
import { buildRouletteOutcomes, secureRandomValue, selectOutcomeSegment, selectRouletteOutcome } from '../services/roulette-selector';
import { generateClaimCode } from '../services/prize-claims';
import { getExperienceEntitlements, subscriptionHasFeature } from '../services/commercial-entitlements';

export const publicExperienceRoutes = new Hono<{ Bindings: Env }>();

type AnalyticsEvent = 'experience_view' | 'roulette_spin_click' | 'roulette_spin_started' | 'roulette_spin_completed' | 'roulette_result_cta_click' | 'roulette_ar_open_click' | 'roulette_ar_session_started' | 'roulette_ar_placed' | 'roulette_ar_session_ended';
type ParticipationPolicy = { maxSpinsPerDevice: number | null; maxSpinsPerSession: number | null; cooldownSeconds: number };
type ParticipationScope = 'device' | 'session';
type ParticipationState = { spin_count: number; last_spin_at: string | null };
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
function trackExperienceEvent(db: D1Database, experienceId: string, organizationId: string, name: string, event: string, userId: string | null, sessionId: string | null, properties: Record<string, unknown>) {
  void recordExperienceEvent(db, experienceId, organizationId, name, event, userId, sessionId, properties).catch(() => undefined);
}
async function hasCommercialAccess(db: D1Database, experienceId: string, organizationId: string) {
  const periods = await getExperienceAccessPeriods(db, experienceId, organizationId);
  return getEffectiveExperienceAccessStatus(periods) === 'active' || !periods.length;
}

function publicParticipationError(reason: string, retryAt?: string) {
  return { error: 'participation_limit_reached', reason, message: reason === 'cooldown' ? 'Podrás volver a participar más tarde.' : reason === 'identity_required' ? 'Necesitamos identificar tu sesión anónima para participar.' : 'Ya alcanzaste el límite de participaciones para esta experiencia.', ...(retryAt ? { retryAt } : {}) };
}

function validParticipantId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function prepareParticipation(db: D1Database, experienceId: string, organizationId: string, policy: ParticipationPolicy, deviceId: string | null, sessionId: string | null, now: Date) {
  const scopes: Array<{ type: ParticipationScope; id: string; limit: number | null; cooldown: number }> = [];
  if (policy.maxSpinsPerDevice !== null || policy.cooldownSeconds > 0) scopes.push({ type: 'device', id: deviceId ?? '', limit: policy.maxSpinsPerDevice, cooldown: policy.cooldownSeconds });
  if (policy.maxSpinsPerSession !== null) scopes.push({ type: 'session', id: sessionId ?? '', limit: policy.maxSpinsPerSession, cooldown: 0 });
  for (const scope of scopes) {
    if (!scope.id) return { blocked: publicParticipationError('identity_required') } as const;
    const state = await db.prepare('SELECT spin_count, last_spin_at FROM experience_participation WHERE experience_id=? AND organization_id=? AND scope_type=? AND participant_id=?').bind(experienceId, organizationId, scope.type, scope.id).first<ParticipationState>();
    if (scope.limit !== null && (state?.spin_count ?? 0) >= scope.limit) return { blocked: publicParticipationError(scope.type === 'device' ? 'device_limit' : 'session_limit') } as const;
    if (scope.cooldown > 0 && state?.last_spin_at) {
      const retryAt = new Date(new Date(state.last_spin_at).getTime() + scope.cooldown * 1000);
      if (now < retryAt) return { blocked: publicParticipationError('cooldown', retryAt.toISOString()) } as const;
    }
  }
  const statements: D1PreparedStatement[] = [];
  const timestamp = now.toISOString();
  for (const scope of scopes) {
    statements.push(db.prepare('INSERT OR IGNORE INTO experience_participation (experience_id, organization_id, scope_type, participant_id) VALUES (?, ?, ?, ?)').bind(experienceId, organizationId, scope.type, scope.id));
    statements.push(db.prepare('UPDATE experience_participation SET spin_count=spin_count+1, last_spin_at=?, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND organization_id=? AND scope_type=? AND participant_id=? AND (? IS NULL OR spin_count<?) AND (?=0 OR last_spin_at IS NULL OR last_spin_at<=?)').bind(timestamp, experienceId, organizationId, scope.type, scope.id, scope.limit, scope.limit ?? 0, scope.cooldown, new Date(now.getTime() - scope.cooldown * 1000).toISOString()));
  }
  return { statements, scopes } as const;
}

publicExperienceRoutes.get('/experiences/:slug', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,draft_config,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; status: string; draft_config: string | null; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);
  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  if (!await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });
  const entitlements = await getExperienceEntitlements(c.env.DB, row.id, row.organization_id);
  let config: unknown;
  try { config = parseJson(row.published_config); } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  if (!config || !validDraftConfig(config)) return c.json({ active: false, reason: 'unavailable' }, 503);
  const inventoryRows = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable FROM experience_prize_inventory WHERE experience_id=?').bind(row.id).all<{ prizeId: string; stockMode: string; stockAvailable: number | null }>();
  const prizeAvailability = Object.fromEntries(inventoryRows.results.map((item) => [item.prizeId, item.stockMode === 'limited' && (item.stockAvailable ?? 0) <= 0 ? 'sold_out' : 'available']));
  return c.json({ active: true, experience: { id: row.id, type: row.type, config, startsAt: row.starts_at, endsAt: row.ends_at, featureEntitlements: entitlements, prizeAvailability } });
});

publicExperienceRoutes.post('/experiences/:slug/spin', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; status: string; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);
  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  if (!await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });
  const entitlements = await getExperienceEntitlements(c.env.DB, row.id, row.organization_id);
  if (row.type !== 'roulette') return c.json({ active: false, reason: 'unavailable' }, 503);
  let config: DraftConfig | null;
  try { config = parseJson(row.published_config) as DraftConfig | null; } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  if (!config || !validDraftConfig(config)) return c.json({ active: false, reason: 'unavailable' }, 503);
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const deviceId = (body.deviceId ?? c.req.header('X-Anonymous-User-Id') ?? null) as string | null;
  const sessionId = (body.sessionId ?? c.req.header('X-Session-Id') ?? null) as string | null;
  const policy = normalizeParticipationConfig(config.participation);
  let applicationId: string | null = null;
  try { applicationId = (await ensureAnalyticsApplication(c.env.DB, row.id, row.organization_id, row.name)) ?? null; } catch { /* analytics is secondary to the authoritative spin */ }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inventoryRows = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=?').bind(row.id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
    const inventory = new Map(inventoryRows.results.map((item) => [item.prizeId, item]));
    const outcomes = buildRouletteOutcomes(config, inventory);
    if (!outcomes.length) return c.json({ active: false, reason: 'unavailable' });
    if ((deviceId !== null && !validParticipantId(deviceId)) || (sessionId !== null && !validParticipantId(sessionId))) {
      const blocked = publicParticipationError('identity_required');
      trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_blocked', null, null, { experienceId: row.id, reason: 'identity_required' });
      return c.json(blocked, 400);
    }
    const participation = await prepareParticipation(c.env.DB, row.id, row.organization_id, policy, deviceId, sessionId, new Date());
    if ('blocked' in participation) {
      const blocked = participation.blocked as ReturnType<typeof publicParticipationError>;
      trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_blocked', null, null, { experienceId: row.id, reason: blocked.reason });
      return c.json(blocked, blocked.reason === 'identity_required' ? 400 : 429);
    }
    const outcome = selectRouletteOutcome(outcomes, secureRandomValue());
    if (outcome.prizeId !== null) {
      const prize = config.prizes.find((item) => item.id === outcome.prizeId)!;
      const stock = inventory.get(prize.id);
      const stockMode = stock?.stockMode ?? (prize.stockMode ?? (prize.stockLimit == null ? 'unlimited' : 'limited'));
      const spinId = crypto.randomUUID();
      const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
      const segment = config.segments[segmentIndex]!;
      const spinInsert = c.env.DB.prepare('INSERT INTO experience_spins (id, experience_id, organization_id, application_id, segment_id, segment_index, prize_id, outcome_type, participant_device_id, participant_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, \'prize\', ?, ?)').bind(spinId, row.id, row.organization_id, applicationId, segment.id, segmentIndex, prize.id, deviceId, sessionId);
      const inventoryInsert = !stock && stockMode === 'unlimited' ? c.env.DB.prepare('INSERT OR IGNORE INTO experience_prize_inventory (experience_id, prize_id, stock_mode, stock_available, delivered_count) VALUES (?, ?, \'unlimited\', NULL, 0)').bind(row.id, prize.id) : null;
      const update = stockMode === 'limited'
        ? c.env.DB.prepare('UPDATE experience_prize_inventory SET stock_available=stock_available-1, delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_available>0').bind(row.id, prize.id)
        : c.env.DB.prepare("UPDATE experience_prize_inventory SET delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_mode='unlimited'").bind(row.id, prize.id);
      const inventoryEvent = c.env.DB.prepare('INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity, spin_id) VALUES (?, ?, ?, \'prize_delivered\', 1, ?)').bind(crypto.randomUUID(), row.id, prize.id, spinId);
      const claim = prize.redemption?.enabled === true && subscriptionHasFeature(entitlements, 'redemption_claims') ? { code: generateClaimCode(), status: 'active' as const } : null;
      const claimInsert = claim ? c.env.DB.prepare('INSERT INTO roulette_prize_claims (id, code, organization_id, experience_id, spin_id, prize_id, prize_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), claim.code, row.organization_id, row.id, spinId, prize.id, prize.name, claim.status) : null;
      const statements = inventoryInsert ? [...participation.statements, inventoryInsert, update, spinInsert, inventoryEvent, ...(claimInsert ? [claimInsert] : [])] : [...participation.statements, update, spinInsert, inventoryEvent, ...(claimInsert ? [claimInsert] : [])];
      let results: D1Result<unknown>[];
      try { results = await c.env.DB.batch(statements); } catch { continue; }
      if (!results[statements.indexOf(update)]?.meta?.changes) continue;
      trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_prize_won', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, prize: prize.name, prizeId: prize.id, spinId });
      const prizeResult = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
      trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_completed', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, spinId, prize: prize.name, prizeId: prize.id });
      const remaining = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable FROM experience_prize_inventory WHERE experience_id=?').bind(row.id).all<{ prizeId: string; stockMode: string; stockAvailable: number | null }>();
      const prizeAvailability = Object.fromEntries(remaining.results.map((item) => [item.prizeId, item.stockMode === 'limited' && (item.stockAvailable ?? 0) <= 0 ? 'sold_out' : 'available']));
      return c.json({ spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prizeResult ? { id: prizeResult.id, name: prizeResult.name, iconUrl: prizeResult.iconUrl ?? null } : null, claim, prizeAvailability });
    }
    const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
    const segment = config.segments[segmentIndex]!;
    const prize = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
    const spinId = crypto.randomUUID();
    const spinInsert = c.env.DB.prepare('INSERT INTO experience_spins (id, experience_id, organization_id, application_id, segment_id, segment_index, prize_id, outcome_type, participant_device_id, participant_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, \'no_prize\', ?, ?)').bind(spinId, row.id, row.organization_id, applicationId, segment.id, segmentIndex, null, deviceId, sessionId);
    await c.env.DB.batch([...participation.statements, spinInsert]);
    trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_spin_completed', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, spinId, result: 'no_prize', prize: 'Sin premio' });
    trackExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, 'roulette_no_prize', c.req.header('X-Anonymous-User-Id') ?? null, c.req.header('X-Session-Id') ?? null, { experienceId: row.id, organizationId: row.organization_id, spinId, prize: 'Sin premio' });
    return c.json({ spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null, claim: null });
  }
  return c.json({ active: false, reason: 'unavailable' }, 503);
});

publicExperienceRoutes.post('/experiences/:slug/events', async (c) => {
  const row = await c.env.DB.prepare('SELECT id,organization_id,name,starts_at,ends_at FROM experiences WHERE slug=? AND status=\'published\'').bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  if (getEffectiveExperienceStatus('published', row.starts_at, row.ends_at) !== 'active' || !await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const body = await c.req.json().catch(() => ({} as { event?: string; userId?: string; sessionId?: string; properties?: Record<string, unknown> }));
  const event = body.event as AnalyticsEvent;
  if (!['experience_view', 'roulette_spin_click', 'roulette_spin_started', 'roulette_spin_completed', 'roulette_result_cta_click', 'roulette_ar_open_click', 'roulette_ar_session_started', 'roulette_ar_placed', 'roulette_ar_session_ended'].includes(event)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid experience event' } }, 400);
  if (body.userId && body.userId.length > 200 || body.sessionId && body.sessionId.length > 200) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid anonymous identifiers' } }, 400);
  await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.name, event, body.userId ?? null, body.sessionId ?? null, body.properties ?? { experienceId: row.id });
  return c.json({ ok: true }, 201);
});
