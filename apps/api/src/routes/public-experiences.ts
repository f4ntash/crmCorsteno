import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { parseJson, validDraftConfig, type DraftConfig } from './experiences';
import { buildRouletteOutcomes, secureRandomValue, selectOutcomeSegment, selectRouletteOutcome } from '../services/roulette-selector';

export const publicExperienceRoutes = new Hono<{ Bindings: Env }>();

publicExperienceRoutes.get('/experiences/:slug', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,type,status,draft_config,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; type: string; status: string; draft_config: string | null; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
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
    'SELECT id,type,status,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<{ id: string; type: string; status: string; published_config: string | null; starts_at: string | null; ends_at: string | null }>();
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
      const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
      const segment = config.segments[segmentIndex]!;
      const prizeResult = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
      return c.json({ spinId, segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prizeResult ? { id: prizeResult.id, name: prizeResult.name, iconUrl: prizeResult.iconUrl ?? null } : null });
    }
    const segmentIndex = selectOutcomeSegment(outcome, secureRandomValue());
    const segment = config.segments[segmentIndex]!;
    const prize = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
    return c.json({ spinId: crypto.randomUUID(), segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null });
  }
  return c.json({ active: false, reason: 'unavailable' }, 503);
});
