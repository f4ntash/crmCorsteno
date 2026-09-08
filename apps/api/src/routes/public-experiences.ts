import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { parseJson, validDraftConfig, type DraftConfig } from './experiences';
import { secureRandomIndex } from '../services/roulette-selector';

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
  const segmentIndex = secureRandomIndex(config.segments.length);
  const segment = config.segments[segmentIndex]!;
  const prize = segment.prizeId === null ? null : config.prizes.find((item) => item.id === segment.prizeId) ?? null;
  return c.json({ spinId: crypto.randomUUID(), segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null });
});
