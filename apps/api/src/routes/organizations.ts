import { Hono } from 'hono'; import { requireAuth, requireOrganization } from '../auth/middleware'; import type { Env } from '../index';
export const organizationRoutes = new Hono<{ Bindings: Env }>(); organizationRoutes.get('/current', requireAuth, requireOrganization, c => c.json(c.get('organization')));
