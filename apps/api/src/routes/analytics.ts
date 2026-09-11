import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import { exportRouletteResults } from '../services/roulette-report';
export { rouletteResultsCsv } from '../services/roulette-report';
import { reportRangeOf, reportSinceIsoOf, reportSinceOf } from '../services/report-filters';
import type { Env } from '../index';
type Metric = 'users' | 'events' | 'games' | 'prizes';
type Dimension = 'game' | 'prize' | 'result' | 'reason' | 'event';
type Vars = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};
export const analyticsRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
analyticsRoutes.use('*', requireAuth, requireOrganization);
analyticsRoutes.use('*', async (c, next) => c.get('organization').role === 'operator' ? c.json({ error: { code: 'FORBIDDEN', message: 'Permission denied' } }, 403) : next());
const rangeOf = reportRangeOf;
const sinceOf = reportSinceOf;
const sinceIsoOf = reportSinceIsoOf;
async function scope(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const q = c.req.query();
  const range = rangeOf(q.range);
  const org = c.get('organization');
  const values: (string | number)[] = [org.id, sinceOf(range)];
  let where = 'organization_id=? AND occurred_at>=?';
  if (q.projectId) {
    const p = await c.env.DB.prepare(
      'SELECT id FROM projects WHERE id=? AND organization_id=?',
    )
      .bind(q.projectId, org.id)
      .first();
    if (!p) throw new Response('Not found', { status: 404 });
    where += ' AND project_id=?';
    values.push(q.projectId);
  }
  if (q.applicationId) {
    const a = await c.env.DB.prepare(
      'SELECT id FROM applications WHERE id=? AND organization_id=?' +
        (q.projectId ? ' AND project_id=?' : ''),
    )
      .bind(
        ...(q.projectId
          ? [q.applicationId, org.id, q.projectId]
          : [q.applicationId, org.id]),
      )
      .first();
    if (!a) throw new Response('Not found', { status: 404 });
    where += ' AND application_id=?';
    values.push(q.applicationId);
  }
  return { q, range, where, values, org };
}
const run = (
  c: Context<{ Bindings: Env; Variables: Vars }>,
  sql: string,
  values: (string | number)[],
) =>
  c.env.DB.prepare(sql)
    .bind(...values)
    .all<{ event_name: string; n: number }>();

const analyticsRead = requireOrganizationPermission('analytics.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Vars }>;

analyticsRoutes.get('/roulette-export', analyticsRead, async (c) => {
  try {
    const file = await exportRouletteResults({ db: c.env.DB, organizationId: c.get('organization').id, query: new URL(c.req.url).searchParams });
    return new Response(file.body, { headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === 'object' && 'status' in error && 'code' in error && 'message' in error) {
      const reportError = error as { status: number; code: string; message: string };
      return c.json({ error: { code: reportError.code, message: reportError.message } }, reportError.status as 400 | 404 | 422);
    }
    throw error;
  }
});

analyticsRoutes.get('/summary', async (c) => {
  const s = await scope(c);
  const rows = (await run(
    c,
    `SELECT event_name,COUNT(*) n FROM events WHERE ${s.where} GROUP BY event_name`,
    s.values,
  )) as { results: { event_name: string; n: number }[] };
  const count = (n: string) =>
    rows.results.find((x) => x.event_name === n)?.n ?? 0;
  const u = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT anonymous_user_id) n FROM events WHERE ${s.where}`,
  )
    .bind(...s.values)
    .first<{ n: number }>();
  const se = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT session_id) n FROM events WHERE ${s.where}`,
  )
    .bind(...s.values)
    .first<{ n: number }>();
  const total = rows.results.reduce((n, x) => n + x.n, 0);
  const operational = await (async () => {
    try {
      let spinFrom = 'experience_spins s';
      let spinWhere = 's.organization_id=? AND s.created_at>=?';
      const spinValues: (string | number)[] = [s.org.id, sinceIsoOf(s.range)];
      if (s.q.projectId) {
        spinFrom += ' JOIN applications a ON a.id=s.application_id AND a.organization_id=s.organization_id';
        spinWhere += ' AND a.project_id=?';
        spinValues.push(s.q.projectId);
      }
      if (s.q.applicationId) {
        spinWhere += ' AND s.application_id=?';
        spinValues.push(s.q.applicationId);
      }
      const spinRows = await c.env.DB.prepare(`SELECT s.outcome_type outcome,COUNT(*) n FROM ${spinFrom} WHERE ${spinWhere} GROUP BY s.outcome_type`).bind(...spinValues).all<{ outcome: string; n: number }>();
      let claimWhere = 'c.organization_id=? AND c.created_at>=?';
      const claimValues: (string | number)[] = [s.org.id, sinceIsoOf(s.range)];
      if (s.q.projectId) { claimWhere += ' AND e.project_id=?'; claimValues.push(s.q.projectId); }
      if (s.q.applicationId) { claimWhere += ' AND es.application_id=?'; claimValues.push(s.q.applicationId); }
      const claimRows = await c.env.DB.prepare(`SELECT c.status,COUNT(*) n FROM roulette_prize_claims c JOIN experiences e ON e.id=c.experience_id AND e.organization_id=c.organization_id JOIN experience_spins es ON es.id=c.spin_id AND es.organization_id=c.organization_id WHERE ${claimWhere} GROUP BY c.status`).bind(...claimValues).all<{ status: string; n: number }>();
      if (spinRows.results.some((row) => row.outcome !== 'prize' && row.outcome !== 'no_prize')) return null;
      const successfulSpins = spinRows.results.reduce((sum, row) => sum + Number(row.n), 0);
      const prizeWins = spinRows.results.find((row) => row.outcome === 'prize')?.n ?? 0;
      const noPrize = spinRows.results.find((row) => row.outcome === 'no_prize')?.n ?? 0;
      const claimsGenerated = claimRows.results.reduce((sum, row) => sum + Number(row.n), 0);
      const claimsRedeemed = claimRows.results.find((row) => row.status === 'redeemed')?.n ?? 0;
      return { successfulSpins, prizeWins, noPrize, claimsGenerated, claimsRedeemed };
    } catch { return null; }
  })();
  const rouletteInsights = await (async () => {
    try {
      if (!s.q.applicationId) return undefined;
      const application = await c.env.DB.prepare('SELECT application_type applicationType FROM applications WHERE id=? AND organization_id=?').bind(s.q.applicationId, s.org.id).first<{ applicationType: string }>();
      if (application?.applicationType !== 'roulette') return undefined;
      const completed = operational?.successfulSpins ?? count('roulette_spin_completed');
      const won = operational?.prizeWins ?? count('roulette_prize_won');
      const claimsGenerated = operational?.claimsGenerated ?? 0;
      const claimsRedeemed = operational?.claimsRedeemed ?? 0;
      return { participants: u?.n ?? 0, completedSpins: completed, winRate: completed ? won / completed : null, prizesWon: won, claimsGenerated, claimsRedeemed, redemptionRate: claimsGenerated ? claimsRedeemed / claimsGenerated : null, blockedParticipation: count('roulette_spin_blocked'), claimsApplicable: claimsGenerated > 0 };
    } catch { return undefined; }
  })();
  const last = await c.env.DB.prepare(
    `SELECT MAX(occurred_at) lastActivityAt FROM events WHERE ${s.where}`,
  )
    .bind(...s.values)
    .first<{ lastActivityAt: number | null }>();
  const started = count('game_started');
  const webar = {
    experiencesStarted: count('experience_started'),
    experiencesFinished: count('experience_finished'),
    targetsDetected: count('image_target_detected'),
    favoritesAdded: count('favorite_added'),
    navigationsStarted: count('navigation_started'),
    schedulesViewed: count('schedule_viewed'),
    cameraPermissionsGranted: count('camera_permission_granted'),
    cameraPermissionsDenied: count('camera_permission_denied'),
  };
  return c.json({
    range: s.range,
    totals: {
      uniqueUsers: u?.n ?? 0,
      sessions: se?.n ?? 0,
      appOpens: count('app_opened'),
      totalEvents: total,
      eventsPerUser: u?.n ? total / u.n : 0,
      lastActivityAt: last?.lastActivityAt ?? null,
      gamesStarted: started,
      gamesFinished: count('game_finished'),
      prizesWon: count('prize_won'),
      prizesClaimed: count('prize_claimed'),
      ...webar,
      rouletteSpinsStarted: count('roulette_spin_started'),
      rouletteSpinsCompleted: operational?.successfulSpins ?? count('roulette_spin_completed'),
      roulettePrizesWon: operational?.prizeWins ?? count('roulette_prize_won'),
      rouletteNoPrize: operational?.noPrize ?? count('roulette_no_prize'),
      rouletteClaimsGenerated: operational?.claimsGenerated ?? 0,
      rouletteClaimsRedeemed: operational?.claimsRedeemed ?? 0,
      rouletteSpinBlocked: count('roulette_spin_blocked'),
      rouletteArOpen: count('roulette_ar_open_click'),
      rouletteArSessions: count('roulette_ar_session_started'),
      rouletteArPlaced: count('roulette_ar_placed'),
    },
    rates: {
      completion: started ? count('game_finished') / started : 0,
      prizeConversion: started ? count('prize_won') / started : 0,
      rouletteConversion: count('experience_view') ? (operational?.successfulSpins ?? count('roulette_spin_started')) / count('experience_view') : 0,
    },
    rouletteInsights,
  });
});
analyticsRoutes.get('/activity', async (c) => {
  const s = await scope(c);
  const limit = Math.min(Number(s.q.limit) || 20, 50);
  return c.json(
    (
      await run(
        c,
        `SELECT occurred_at occurredAt,event_name event,anonymous_user_id anonymousUserId,properties FROM events WHERE ${s.where} ORDER BY occurred_at DESC LIMIT ?`,
        [...s.values, limit],
      )
    ).results,
  );
});
analyticsRoutes.get('/breakdown', async (c) => {
  const s = await scope(c);
  const d = s.q.dimension as Dimension | undefined;
  if (d === 'event') {
    const rows = await c.env.DB.prepare(
      `SELECT event_name name,COUNT(*) value FROM events WHERE ${s.where} GROUP BY event_name ORDER BY value DESC LIMIT 20`,
    )
      .bind(...s.values)
      .all();
    return c.json({ dimension: d, items: rows.results });
  }
  if (d === 'prize' && s.q.applicationId) {
    const application = await c.env.DB.prepare('SELECT application_type applicationType FROM applications WHERE id=? AND organization_id=?').bind(s.q.applicationId, s.org.id).first<{ applicationType: string }>();
    if (application?.applicationType === 'roulette') {
      try {
        let spinWhere = "s.organization_id=? AND s.created_at>=? AND s.outcome_type='prize' AND s.application_id=?";
        const spinValues: (string | number)[] = [s.org.id, sinceIsoOf(s.range), s.q.applicationId];
        if (s.q.projectId) { spinWhere += ' AND a.project_id=?'; spinValues.push(s.q.projectId); }
        const spinRows = await c.env.DB.prepare(`SELECT s.prize_id prizeId,e.published_config publishedConfig,e.draft_config draftConfig FROM experience_spins s JOIN experiences e ON e.id=s.experience_id AND e.organization_id=s.organization_id JOIN applications a ON a.id=s.application_id AND a.organization_id=s.organization_id WHERE ${spinWhere}`).bind(...spinValues).all<{ prizeId: string; publishedConfig: string | null; draftConfig: string | null }>();
        const counts = new Map<string, { prizeId: string; name: string; wins: number }>();
        for (const row of spinRows.results) {
          let name = row.prizeId;
          try {
            const config = JSON.parse(row.publishedConfig ?? row.draftConfig ?? '{}') as { prizes?: Array<{ id?: string; name?: string }> };
            name = config.prizes?.find((prize) => prize.id === row.prizeId)?.name ?? name;
          } catch { /* keep the stable prize id */ }
          const current = counts.get(row.prizeId) ?? { prizeId: row.prizeId, name, wins: 0 };
          current.wins += 1;
          current.name = name;
          counts.set(row.prizeId, current);
        }
        let claimWhere = 'c.organization_id=? AND c.created_at>=? AND es.application_id=?';
        const claimValues: (string | number)[] = [s.org.id, sinceIsoOf(s.range), s.q.applicationId];
        if (s.q.projectId) { claimWhere += ' AND a.project_id=?'; claimValues.push(s.q.projectId); }
        const claimRows = await c.env.DB.prepare(`SELECT c.prize_id prizeId,COUNT(*) generated,SUM(CASE WHEN c.status='redeemed' THEN 1 ELSE 0 END) redeemed FROM roulette_prize_claims c JOIN experience_spins es ON es.id=c.spin_id AND es.organization_id=c.organization_id JOIN applications a ON a.id=es.application_id AND a.organization_id=es.organization_id WHERE ${claimWhere} GROUP BY c.prize_id`).bind(...claimValues).all<{ prizeId: string; generated: number; redeemed: number | null }>();
        const claims = new Map(claimRows.results.map((row) => [row.prizeId, { generated: Number(row.generated), redeemed: Number(row.redeemed ?? 0) }]));
        const totalWins = [...counts.values()].reduce((sum, item) => sum + item.wins, 0);
        return c.json({ dimension: d, items: [...counts.values()].sort((a, b) => b.wins - a.wins).slice(0, 10).map((item) => { const claim = claims.get(item.prizeId); const generated = claim?.generated ?? 0; const redeemed = claim?.redeemed ?? 0; return { name: item.name, value: item.wins, prizeId: item.prizeId, wins: item.wins, shareOfWins: totalWins ? item.wins / totalWins : null, claimsGenerated: generated, pending: Math.max(0, generated - redeemed), redeemed, redemptionRate: generated ? redeemed / generated : null, claimsApplicable: claims.size > 0 }; }) });
      } catch { /* fall through to the legacy event breakdown for older fixtures */ }
    }
  }
  if (d !== 'game' && d !== 'prize' && d !== 'result' && d !== 'reason')
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid dimension' } },
      400,
    );
  const rows = await c.env.DB.prepare(
    `SELECT properties FROM events WHERE ${s.where} AND properties IS NOT NULL`,
  )
    .bind(...s.values)
    .all<{ properties: string }>();
  const m = new Map<string, number>();
  for (const row of rows.results) {
    try {
      const v = (JSON.parse(row.properties) as Record<string, unknown>)[d];
      if (typeof v === 'string') m.set(v, (m.get(v) ?? 0) + 1);
    } catch {
      continue;
    }
  }
  return c.json({
    dimension: d,
    items: [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value })),
  });
});
analyticsRoutes.get('/recurrence', async (c) => {
  const s = await scope(c);
  const rows = await c.env.DB.prepare(
    `SELECT anonymous_user_id userId,COUNT(*) n FROM events WHERE ${s.where} AND event_name=? AND anonymous_user_id IS NOT NULL GROUP BY anonymous_user_id`,
  )
    .bind(...s.values, 'game_finished')
    .all<{ userId: string; n: number }>();
  const result = { once: 0, twice: 0, threeOrMore: 0 };
  for (const row of rows.results) {
    if (row.n === 1) result.once++;
    else if (row.n === 2) result.twice++;
    else result.threeOrMore++;
  }
  return c.json(result);
});
analyticsRoutes.get('/timeseries', async (c) => {
  const s = await scope(c);
  const metric = s.q.metric as Metric | undefined;
  if (
    metric !== 'users' &&
    metric !== 'events' &&
    metric !== 'games' &&
    metric !== 'prizes'
  )
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid metric' } },
      400,
    );
  const size = s.range === '24h' ? 3600000 : 86400000;
  const rows = await c.env.DB.prepare(
    `SELECT occurred_at occurredAt,event_name event,anonymous_user_id userId FROM events WHERE ${s.where} ORDER BY occurred_at`,
  )
    .bind(...s.values)
    .all<{ occurredAt: number; event: string; userId: string | null }>();
  const p = new Map<number, Set<string> | number>();
  for (const row of rows.results) {
    const b = Math.floor(row.occurredAt / size) * size;
    const old = p.get(b);
    if (metric === 'users') {
      if (old instanceof Set) old.add(row.userId ?? '');
      else p.set(b, new Set(row.userId ? [row.userId] : []));
    } else {
      const value =
        metric === 'events'
          ? 1
          : metric === 'games' &&
              ['game_started', 'game_finished'].includes(row.event)
            ? 1
            : metric === 'prizes' &&
                ['prize_won', 'prize_claimed'].includes(row.event)
              ? 1
              : 0;
      p.set(b, (typeof old === 'number' ? old : 0) + value);
    }
  }
  return c.json({
    metric,
    range: s.range,
    interval: s.range === '24h' ? 'hour' : 'day',
    points: [...p]
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, value]) => ({
        timestamp,
        value: value instanceof Set ? value.size : value,
      })),
  });
});
