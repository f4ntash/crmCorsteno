import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { hasCommercialAccess } from '../services/public-experience-access';
import { validPublicParticipantId } from '../services/public-experience-types';
import { normalizeParticipationConfig, parseJson, validDraftConfig, type DraftConfig } from './experiences';
import { buildRouletteOutcomes, secureRandomValue, selectLocalAcceptanceOutcome, selectOutcomeSegment } from '../services/roulette-selector';
import { generateClaimCode } from '../services/prize-claims';
import { getExperienceEntitlements, subscriptionHasFeature } from '../services/commercial-entitlements';
import { ensureExperienceAnalyticsApplication } from '../services/experience-analytics';
import { hasActiveHostedChannel } from '../services/hosted-delivery';

export const roulettePublicExperienceRoutes = new Hono<{ Bindings: Env }>();

type AnalyticsEvent = 'experience_view' | 'roulette_spin_click' | 'roulette_spin_started' | 'roulette_result_cta_click' | 'roulette_ar_open_click' | 'roulette_ar_session_started' | 'roulette_ar_placed' | 'roulette_ar_session_ended';
type ParticipationPolicy = { maxSpinsPerDevice: number | null; maxSpinsPerSession: number | null; cooldownSeconds: number };
type ParticipationScope = 'device' | 'session';
type ParticipationState = { spin_count: number; last_spin_at: string | null };
type SpinReplayRow = { request_id: string; response_json: string | null; participant_device_id: string | null; participant_session_id: string | null };
async function recordExperienceEvent(db: D1Database, experienceId: string, organizationId: string, experienceType: string, name: string, event: string, userId: string | null, sessionId: string | null, properties: Record<string, unknown> = {}) {
  const applicationId = await ensureExperienceAnalyticsApplication({ db, experienceId, organizationId, experienceType, name });
  if (!applicationId) return;
  const app = await db.prepare('SELECT project_id projectId FROM applications WHERE id=? AND organization_id=?').bind(applicationId, organizationId).first<{ projectId: string }>();
  if (!app) return;
  await db.prepare('INSERT INTO events (id,organization_id,project_id,application_id,event_name,anonymous_user_id,session_id,properties,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, app.projectId, applicationId, event, userId, sessionId, JSON.stringify(properties), Date.now(), Date.now()).run();
}
function trackExperienceEvent(ctx: { waitUntil(promise: Promise<unknown>): void }, db: D1Database, experienceId: string, organizationId: string, experienceType: string, name: string, event: string, userId: string | null, sessionId: string | null, properties: Record<string, unknown>) {
  ctx.waitUntil(recordExperienceEvent(db, experienceId, organizationId, experienceType, name, event, userId, sessionId, properties).catch(() => undefined));
}
function publicParticipationError(reason: string, retryAt?: string) {
  return { error: 'participation_limit_reached', reason, message: reason === 'cooldown' ? 'Podrás volver a participar más tarde.' : reason === 'identity_required' ? 'Necesitamos identificar tu sesión anónima para participar.' : 'Ya alcanzaste el límite de participaciones para esta experiencia.', ...(retryAt ? { retryAt } : {}) };
}

async function checkParticipation(db: D1Database, experienceId: string, organizationId: string, policy: ParticipationPolicy, deviceId: string | null, sessionId: string | null, now: Date) {
  const scopes: Array<{ type: ParticipationScope; id: string; limit: number | null; cooldown: number }> = [];
  if (policy.maxSpinsPerDevice !== null || policy.cooldownSeconds > 0) scopes.push({ type: 'device', id: deviceId ?? '', limit: policy.maxSpinsPerDevice, cooldown: policy.cooldownSeconds });
  if (policy.maxSpinsPerSession !== null) scopes.push({ type: 'session', id: sessionId ?? '', limit: policy.maxSpinsPerSession, cooldown: 0 });
  for (const scope of scopes) {
    if (!scope.id) return { reason: 'identity_required' as const };
    const idColumn = scope.type === 'device' ? 'participant_device_id' : 'participant_session_id';
    const state = await db.prepare(`SELECT COUNT(*) spin_count, MAX(created_at) last_spin_at FROM experience_spins WHERE experience_id=? AND organization_id=? AND ${idColumn}=?`).bind(experienceId, organizationId, scope.id).first<ParticipationState>();
    if (scope.limit !== null && (state?.spin_count ?? 0) >= scope.limit) return { reason: scope.type === 'device' ? 'device_limit' as const : 'session_limit' as const };
    if (scope.cooldown > 0 && state?.last_spin_at) {
      const retryAt = new Date(new Date(state.last_spin_at).getTime() + scope.cooldown * 1000);
      if (now < retryAt) return { reason: 'cooldown' as const, retryAt: retryAt.toISOString() };
    }
  }
  return null;
}

async function readSpinRequestBody(request: Request, maxBytes = 4096): Promise<{ kind: 'ok'; value: Record<string, unknown> } | { kind: 'too_large' } | { kind: 'invalid' }> {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return { kind: 'too_large' };
  if (!request.body) return { kind: 'ok', value: {} };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        return { kind: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: 'invalid' };
  }
  try {
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { kind: 'invalid' };
    return { kind: 'ok', value: parsed as Record<string, unknown> };
  } catch {
    return { kind: 'invalid' };
  }
}

function admittedSpinInsert(db: D1Database, input: {
  spinId: string; requestId: string; response: Record<string, unknown>; experienceId: string; organizationId: string;
  publishedConfig: string; applicationId: string | null; segmentId: string; segmentIndex: number; prizeId: string | null;
  outcomeType: 'prize' | 'no_prize'; deviceId: string | null; sessionId: string | null; policy: ParticipationPolicy;
  stockMode?: 'limited' | 'unlimited'; now: Date;
}) {
  const conditions: string[] = ["EXISTS (SELECT 1 FROM experiences e WHERE e.id=? AND e.organization_id=? AND e.status='published' AND e.published_config=? AND (e.starts_at IS NULL OR julianday(e.starts_at)<=julianday('now')) AND (e.ends_at IS NULL OR julianday(e.ends_at)>julianday('now')))"];
  const args: unknown[] = [input.experienceId, input.organizationId, input.publishedConfig];
  conditions.push("(NOT EXISTS (SELECT 1 FROM experience_access_periods WHERE experience_id=? AND organization_id=?) OR EXISTS (SELECT 1 FROM experience_access_periods WHERE experience_id=? AND organization_id=? AND julianday(starts_at)<=julianday('now') AND julianday(ends_at)>julianday('now')))");
  args.push(input.experienceId, input.organizationId, input.experienceId, input.organizationId);
  conditions.push("EXISTS (SELECT 1 FROM experience_channels ec JOIN channels c ON c.id=ec.channel_id AND c.organization_id=ec.organization_id WHERE ec.experience_id=? AND ec.organization_id=? AND c.type='hosted_runtime' AND c.status='active')");
  args.push(input.experienceId, input.organizationId);
  const addLimit = (column: 'participant_device_id' | 'participant_session_id', id: string | null, limit: number | null) => {
    if (limit === null) return;
    conditions.push(`? IS NOT NULL AND (SELECT COUNT(*) FROM experience_spins WHERE experience_id=? AND organization_id=? AND ${column}=?)<?`);
    args.push(id, input.experienceId, input.organizationId, id, limit);
  };
  addLimit('participant_device_id', input.deviceId, input.policy.maxSpinsPerDevice);
  addLimit('participant_session_id', input.sessionId, input.policy.maxSpinsPerSession);
  if (input.policy.cooldownSeconds > 0) {
    conditions.push("? IS NOT NULL AND NOT EXISTS (SELECT 1 FROM experience_spins WHERE experience_id=? AND organization_id=? AND participant_device_id=? AND julianday(created_at)>julianday(?) - (?/86400.0))");
    args.push(input.deviceId, input.experienceId, input.organizationId, input.deviceId, input.now.toISOString(), input.policy.cooldownSeconds);
  }
  if (input.prizeId && input.stockMode === 'limited') {
    conditions.push("EXISTS (SELECT 1 FROM experience_prize_inventory WHERE experience_id=? AND prize_id=? AND stock_mode='limited' AND stock_available>0)");
    args.push(input.experienceId, input.prizeId);
  } else if (input.prizeId && input.stockMode === 'unlimited') {
    conditions.push("(NOT EXISTS (SELECT 1 FROM experience_prize_inventory WHERE experience_id=? AND prize_id=?) OR EXISTS (SELECT 1 FROM experience_prize_inventory WHERE experience_id=? AND prize_id=? AND stock_mode='unlimited'))");
    args.push(input.experienceId, input.prizeId, input.experienceId, input.prizeId);
  }
  const insertArgs = [input.spinId, input.experienceId, input.organizationId, input.applicationId, input.segmentId, input.segmentIndex, input.prizeId, input.outcomeType, input.deviceId, input.sessionId, input.requestId, JSON.stringify(input.response)];
  return db.prepare(`INSERT INTO experience_spins (id,experience_id,organization_id,application_id,segment_id,segment_index,prize_id,outcome_type,participant_device_id,participant_session_id,request_id,response_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${conditions.join(' AND ')}`).bind(...insertArgs, ...args);
}

async function readSpinReplay(db: D1Database, experienceId: string, organizationId: string, requestId: string) {
  return db.prepare('SELECT request_id,response_json,participant_device_id,participant_session_id FROM experience_spins WHERE experience_id=? AND organization_id=? AND request_id=?').bind(experienceId, organizationId, requestId).first<SpinReplayRow>();
}

roulettePublicExperienceRoutes.post('/experiences/:slug/spin', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; status: string; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);
  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  if (!await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });
  if (!await hasActiveHostedChannel(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });
  const entitlements = await getExperienceEntitlements(c.env.DB, row.id, row.organization_id);
  if (row.type !== 'roulette') return c.json({ active: false, reason: 'unavailable' }, 503);
  let config: DraftConfig | null;
  try { config = parseJson(row.published_config) as DraftConfig | null; } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  if (!config || !validDraftConfig(config)) return c.json({ active: false, reason: 'unavailable' }, 503);
  const body = await readSpinRequestBody(c.req.raw);
  if (body.kind === 'too_large') return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' } }, 413);
  if (body.kind === 'invalid') return c.json({ error: { code: 'BAD_REQUEST', message: 'La solicitud no es válida.' } }, 400);
  const deviceInput = body.value.deviceId ?? c.req.header('X-Anonymous-User-Id') ?? null;
  const sessionInput = body.value.sessionId ?? c.req.header('X-Session-Id') ?? null;
  const deviceId = typeof deviceInput === 'string' ? deviceInput : null;
  const sessionId = typeof sessionInput === 'string' ? sessionInput : null;
  if ((deviceInput !== null && !validPublicParticipantId(deviceInput)) || (sessionInput !== null && !validPublicParticipantId(sessionInput))) return c.json({ error: { code: 'BAD_REQUEST', message: 'La identidad de participación no es válida.' } }, 400);
  if (body.value.requestId !== undefined && !validPublicParticipantId(body.value.requestId)) return c.json({ error: { code: 'BAD_REQUEST', message: 'La solicitud de giro no es válida.' } }, 400);
  const requestId = (body.value.requestId as string | undefined) ?? crypto.randomUUID();
  const policy = normalizeParticipationConfig(config.participation);
  const invalidIdentity = (policy.maxSpinsPerDevice !== null || policy.cooldownSeconds > 0) && !deviceId || policy.maxSpinsPerSession !== null && !sessionId;
  const replay = await readSpinReplay(c.env.DB, row.id, row.organization_id, requestId);
  if (replay) {
    if (replay.participant_device_id !== deviceId || replay.participant_session_id !== sessionId || !replay.response_json) return c.json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: 'La solicitud de giro ya fue utilizada.' } }, 409);
    try { return c.json(JSON.parse(replay.response_json) as Record<string, unknown>); } catch { return c.json({ active: false, reason: 'unavailable' }, 503); }
  }
  let applicationId: string | null = null;
  try { applicationId = (await ensureExperienceAnalyticsApplication({ db: c.env.DB, experienceId: row.id, organizationId: row.organization_id, experienceType: row.type, name: row.name })) ?? null; } catch { /* analytics is secondary to the authoritative spin */ }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inventoryRows = await c.env.DB.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable, delivered_count deliveredCount FROM experience_prize_inventory WHERE experience_id=?').bind(row.id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }>();
    const inventory = new Map(inventoryRows.results.map((item) => [item.prizeId, item]));
    const outcomes = buildRouletteOutcomes(config, inventory);
    if (invalidIdentity) {
      const blocked = publicParticipationError('identity_required');
      trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_blocked', null, null, { experienceId: row.id, reason: 'identity_required' });
      return c.json(blocked, 400);
    }
    const now = new Date();
    const participationCheck = await checkParticipation(c.env.DB, row.id, row.organization_id, policy, deviceId, sessionId, now);
    if (participationCheck) {
      const blocked = publicParticipationError(participationCheck.reason, participationCheck.retryAt);
      trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_blocked', deviceId, sessionId, { experienceId: row.id, reason: participationCheck.reason });
      return c.json(blocked, participationCheck.reason === 'identity_required' ? 400 : 429);
    }
    if (!outcomes.length) return c.json({ active: false, reason: 'unavailable' });
    const outcome = selectLocalAcceptanceOutcome(outcomes, secureRandomValue(), c.env.ENVIRONMENT, c.env.LOCAL_ACCEPTANCE_PRIZE_ID);
    if (outcome.prizeId !== null) {
      const prize = config.prizes.find((item) => item.id === outcome.prizeId)!;
      const stock = inventory.get(prize.id);
      const stockMode = stock?.stockMode ?? (prize.stockMode ?? (prize.stockLimit == null ? 'unlimited' : 'limited'));
      const spinId = crypto.randomUUID();
      const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
      const segment = config.segments[segmentIndex]!;
      const prizeAvailability = Object.fromEntries(config.prizes.map((item) => {
        const itemStock = inventory.get(item.id);
        const itemMode = itemStock?.stockMode ?? (item.stockMode ?? (item.stockLimit == null ? 'unlimited' : 'limited'));
        const available = itemStock?.stockAvailable ?? (itemMode === 'limited' ? item.initialStock ?? item.stockLimit ?? 0 : null);
        const afterDelivery = item.id === prize.id && itemMode === 'limited' ? (available ?? 0) - 1 : available;
        return [item.id, itemMode === 'limited' && (afterDelivery ?? 0) <= 0 ? 'sold_out' : 'available'];
      }));
      const prizeResult = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
      const response = { spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prizeResult ? { id: prizeResult.id, name: prizeResult.name, iconUrl: prizeResult.iconUrl ?? null } : null, claim: null as { code: string; status: 'active' } | null, prizeAvailability };
      const inventoryInsert = !stock && stockMode === 'unlimited' ? c.env.DB.prepare("INSERT OR IGNORE INTO experience_prize_inventory (experience_id, prize_id, stock_mode, stock_available, delivered_count) SELECT ?, ?, 'unlimited', NULL, 0 WHERE EXISTS (SELECT 1 FROM experience_spins WHERE id=?)").bind(row.id, prize.id, spinId) : null;
      const update = stockMode === 'limited'
        ? c.env.DB.prepare('UPDATE experience_prize_inventory SET stock_available=stock_available-1, delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_mode=\'limited\' AND stock_available>0 AND EXISTS (SELECT 1 FROM experience_spins WHERE id=?)').bind(row.id, prize.id, spinId)
        : c.env.DB.prepare("UPDATE experience_prize_inventory SET delivered_count=delivered_count+1, updated_at=CURRENT_TIMESTAMP WHERE experience_id=? AND prize_id=? AND stock_mode='unlimited' AND EXISTS (SELECT 1 FROM experience_spins WHERE id=?)").bind(row.id, prize.id, spinId);
      const inventoryEvent = c.env.DB.prepare("INSERT INTO experience_prize_inventory_events (id, experience_id, prize_id, type, quantity, spin_id) SELECT ?, ?, ?, 'prize_delivered', 1, ? WHERE EXISTS (SELECT 1 FROM experience_spins WHERE id=?)").bind(crypto.randomUUID(), row.id, prize.id, spinId, spinId);
      const claim = prize.redemption?.enabled === true && subscriptionHasFeature(entitlements, 'redemption_claims') ? { code: generateClaimCode(), status: 'active' as const } : null;
      if (claim) response.claim = claim;
      const spinInsert = admittedSpinInsert(c.env.DB, { spinId, requestId, response, experienceId: row.id, organizationId: row.organization_id, publishedConfig: row.published_config!, applicationId, segmentId: segment.id, segmentIndex, prizeId: prize.id, outcomeType: 'prize', deviceId, sessionId, policy, stockMode, now });
      const claimInsert = claim ? c.env.DB.prepare("INSERT INTO roulette_prize_claims (id, code, organization_id, experience_id, spin_id, prize_id, prize_name, status) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM experience_spins WHERE id=?)").bind(crypto.randomUUID(), claim.code, row.organization_id, row.id, spinId, prize.id, prize.name, claim.status, spinId) : null;
      const statements = [spinInsert, ...(inventoryInsert ? [inventoryInsert] : []), update, inventoryEvent, ...(claimInsert ? [claimInsert] : [])];
      let results: D1Result<unknown>[];
      try { results = await c.env.DB.batch(statements); } catch {
        const racedReplay = await readSpinReplay(c.env.DB, row.id, row.organization_id, requestId);
        if (racedReplay?.participant_device_id === deviceId && racedReplay.participant_session_id === sessionId && racedReplay.response_json) return c.json(JSON.parse(racedReplay.response_json) as Record<string, unknown>);
        continue;
      }
      if (!results[0]?.meta?.changes) {
        const racedReplay = await readSpinReplay(c.env.DB, row.id, row.organization_id, requestId);
        if (racedReplay?.participant_device_id === deviceId && racedReplay.participant_session_id === sessionId && racedReplay.response_json) return c.json(JSON.parse(racedReplay.response_json) as Record<string, unknown>);
        const blocked = await checkParticipation(c.env.DB, row.id, row.organization_id, policy, deviceId, sessionId, new Date());
        if (blocked) {
          const error = publicParticipationError(blocked.reason, blocked.retryAt);
          trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_blocked', deviceId, sessionId, { experienceId: row.id, reason: blocked.reason });
          return c.json(error, blocked.reason === 'identity_required' ? 400 : 429);
        }
        continue;
      }
      trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_prize_won', deviceId, sessionId, { experienceId: row.id, prize: prize.name, prizeId: prize.id, spinId });
      trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_completed', deviceId, sessionId, { experienceId: row.id, spinId, prize: prize.name, prizeId: prize.id });
      return c.json(response);
    }
    const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
    const segment = config.segments[segmentIndex]!;
    const prize = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
    const spinId = crypto.randomUUID();
    const response = { spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null, claim: null };
    const spinInsert = admittedSpinInsert(c.env.DB, { spinId, requestId, response, experienceId: row.id, organizationId: row.organization_id, publishedConfig: row.published_config!, applicationId, segmentId: segment.id, segmentIndex, prizeId: null, outcomeType: 'no_prize', deviceId, sessionId, policy, now });
    let results: D1Result<unknown>[];
    try { results = await c.env.DB.batch([spinInsert]); } catch {
      const racedReplay = await readSpinReplay(c.env.DB, row.id, row.organization_id, requestId);
      if (racedReplay?.participant_device_id === deviceId && racedReplay.participant_session_id === sessionId && racedReplay.response_json) return c.json(JSON.parse(racedReplay.response_json) as Record<string, unknown>);
      continue;
    }
    if (!results[0]?.meta?.changes) {
      const racedReplay = await readSpinReplay(c.env.DB, row.id, row.organization_id, requestId);
      if (racedReplay?.participant_device_id === deviceId && racedReplay.participant_session_id === sessionId && racedReplay.response_json) return c.json(JSON.parse(racedReplay.response_json) as Record<string, unknown>);
      const blocked = await checkParticipation(c.env.DB, row.id, row.organization_id, policy, deviceId, sessionId, new Date());
      if (blocked) {
        const error = publicParticipationError(blocked.reason, blocked.retryAt);
        trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_blocked', deviceId, sessionId, { experienceId: row.id, reason: blocked.reason });
        return c.json(error, blocked.reason === 'identity_required' ? 400 : 429);
      }
      continue;
    }
    trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_spin_completed', deviceId, sessionId, { experienceId: row.id, spinId, result: 'no_prize', prize: 'Sin premio' });
    trackExperienceEvent(c.executionCtx, c.env.DB, row.id, row.organization_id, row.type, row.name, 'roulette_no_prize', deviceId, sessionId, { experienceId: row.id, organizationId: row.organization_id, spinId, prize: 'Sin premio' });
    return c.json(response);
  }
  return c.json({ active: false, reason: 'unavailable' }, 503);
});
roulettePublicExperienceRoutes.post('/experiences/:slug/events', async (c) => {
  const row = await c.env.DB.prepare('SELECT id,organization_id,name,type,starts_at,ends_at FROM experiences WHERE slug=? AND status=\'published\'').bind(c.req.param('slug')).first<{ id: string; organization_id: string; name: string; type: string; starts_at: string | null; ends_at: string | null }>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  if (getEffectiveExperienceStatus('published', row.starts_at, row.ends_at) !== 'active' || !await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  if (!await hasActiveHostedChannel(c.env.DB, row.id, row.organization_id)) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const body = await c.req.json().catch(() => ({} as { event?: string; userId?: string; sessionId?: string; properties?: Record<string, unknown> }));
  const event = body.event as AnalyticsEvent;
  if (!['experience_view', 'roulette_spin_click', 'roulette_spin_started', 'roulette_result_cta_click', 'roulette_ar_open_click', 'roulette_ar_session_started', 'roulette_ar_placed', 'roulette_ar_session_ended'].includes(event)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid experience event' } }, 400);
  if (body.userId && body.userId.length > 200 || body.sessionId && body.sessionId.length > 200) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid anonymous identifiers' } }, 400);
  await recordExperienceEvent(c.env.DB, row.id, row.organization_id, row.type, row.name, event, body.userId ?? null, body.sessionId ?? null, body.properties ?? { experienceId: row.id });
  return c.json({ ok: true }, 201);
});
