import { Hono } from 'hono';
import type { Env } from '../index';
import { getEffectiveExperienceStatus } from '../services/experience-status';
import { hasCommercialAccess } from '../services/public-experience-access';
import { getExperienceEntitlements } from '../services/commercial-entitlements';
import { resolvePublicExperienceAdapter } from '../services/public-experience-types';
import { hasActiveHostedChannel } from '../services/hosted-delivery';

export const publicExperienceRoutes = new Hono<{ Bindings: Env }>();

type PublicExperienceRow = {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  status: string;
  published_config: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

publicExperienceRoutes.get('/experiences/:slug', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id,organization_id,name,type,status,published_config,starts_at,ends_at FROM experiences WHERE slug=?',
  ).bind(c.req.param('slug')).first<PublicExperienceRow>();
  if (!row) return c.json({ active: false, reason: 'not_found' }, 404);

  const effectiveStatus = getEffectiveExperienceStatus(row.status as 'draft' | 'published' | 'paused', row.starts_at, row.ends_at);
  if (row.status !== 'published' || effectiveStatus !== 'active') return c.json({ active: false, reason: effectiveStatus });
  if (!await hasCommercialAccess(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });
  if (!await hasActiveHostedChannel(c.env.DB, row.id, row.organization_id)) return c.json({ active: false, reason: 'unavailable' });

  const adapter = resolvePublicExperienceAdapter(row.type);
  if (!adapter) return c.json({ active: false, reason: 'unavailable' }, 503);

  const featureEntitlements = await getExperienceEntitlements(c.env.DB, row.id, row.organization_id);
  const result = await adapter.buildPublicPayload({
    db: c.env.DB,
    experience: {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      type: row.type,
      publishedConfig: row.published_config,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    },
    featureEntitlements,
    deviceId: c.req.header('X-Anonymous-User-Id') ?? null,
    sessionId: c.req.header('X-Session-Id') ?? null,
  });

  if (result.kind === 'inactive') return c.json({ active: false, reason: result.reason }, result.status ?? 200);
  return c.json({
    active: true,
    experience: {
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      featureEntitlements,
      ...result.payload,
    },
  });
});
