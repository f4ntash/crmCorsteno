import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { health } from './routes/health';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import { appDataRoutes } from './routes/app-data'; import { adminRoutes } from './routes/admin';
import { eventRoutes } from './routes/events'; import { analyticsRoutes } from './routes/analytics';

export interface Env {
  ENVIRONMENT: string;
  APP_VERSION: string;
  WEB_ORIGIN?: string;
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();
const developmentOrigins = ['https://localhost:5173', 'https://localhost:5175', 'http://localhost:5173', 'http://localhost:5175'];

app.use('*', async (c, next) => {
  const configuredOrigins = c.env.WEB_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean) ?? [];
  const allowedOrigins = c.env.ENVIRONMENT === 'development' ? [...new Set([...developmentOrigins, ...configuredOrigins])] : configuredOrigins;
  return cors({ origin: origin => allowedOrigins.includes(origin) ? origin : '', credentials: true, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-Organization-Id', 'Authorization'] })(c, next);
});
app.get('/health', health);
app.route('/auth', authRoutes);
app.route('/organizations', organizationRoutes);
app.route('/admin', adminRoutes);
app.route('/v1', eventRoutes); app.route('/analytics', analyticsRoutes);
app.route('/', appDataRoutes);
app.get('/dev/db-check', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') return c.notFound();
  const result = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM organizations').first<{ count: number }>();
  return c.json({ database: 'ok', organizations: result?.count ?? 0 });
});

export default app;
