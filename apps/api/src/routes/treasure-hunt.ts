import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

export const treasureHuntRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
treasureHuntRoutes.use('*', requireAuth, requireOrganization);
treasureHuntRoutes.use('*', requireOrganizationPermission('crm.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>);

async function forward(c: Parameters<MiddlewareHandler>[0], path: string) {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_ADMIN_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Organization-Id': c.get('organization').id,
      },
    });
    const body = await response.text();
    if (response.status === 404) return c.json({ error: { code: 'NOT_FOUND', message: 'Campaña no encontrada.' } }, 404);
    if (!response.ok) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

treasureHuntRoutes.get('/campaigns', (c) => forward(c, '/v1/admin/hunts'));
treasureHuntRoutes.get('/campaigns/:id', (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}`));
