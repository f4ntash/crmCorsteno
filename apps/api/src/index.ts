import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { health } from './routes/health';
import { authRoutes } from './routes/auth';
import { organizationRoutes } from './routes/organizations';
import { appDataRoutes } from './routes/app-data';
import { adminRoutes } from './routes/admin';
import { eventRoutes } from './routes/events';
import { analyticsRoutes } from './routes/analytics';
import { experienceRoutes } from './routes/experiences';
import { requireAuth, requireOrganization } from './auth/middleware';
import { publicExperienceRoutes } from './routes/public-experiences';
import { roulettePublicExperienceRoutes } from './routes/roulette-public-experiences';
import { commercialRoutes } from './routes/commercial';
import { paymentWebhookRoutes } from './routes/payment-webhooks';
import { assetRoutes } from './routes/assets';
import { attentionRoutes } from './routes/attention';
import { reportsRoutes } from './routes/reports';
import { catalogRoutes } from './routes/catalog';
import { channelRoutes } from './routes/channels';

export interface Env {
  ENVIRONMENT: string;
  APP_VERSION: string;
  WEB_ORIGIN?: string;
  WEB_ORIGINS?: string;
  LOCAL_ACCEPTANCE_PRIZE_ID?: string;
  PUBLIC_ORIGINS?: string;
  DB: D1Database;
  EXPERIENCE_ASSETS?: R2Bucket;
  MERCADO_PAGO_ACCESS_TOKEN?: string;
  MERCADO_PAGO_WEBHOOK_SECRET?: string;
  MERCADO_PAGO_API_URL?: string;
  PUBLIC_WEBHOOK_URL?: string;
  PAYMENT_SUCCESS_URL?: string;
  PAYMENT_FAILURE_URL?: string;
  PAYMENT_PENDING_URL?: string;
}

const app = new Hono<{ Bindings: Env }>();
const developmentOrigins = [
  'https://localhost:5173',
  'https://localhost:5175',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://localhost:5174',
];

app.use('*', async (c, next) => {
  const configuredOrigins = [c.env.WEB_ORIGINS, c.env.WEB_ORIGIN]
    .filter(Boolean)
    .join(',')
    .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  const allowedOrigins =
    c.env.ENVIRONMENT === 'development'
      ? [...new Set([...developmentOrigins, ...configuredOrigins, ...(c.env.PUBLIC_ORIGINS?.split(',') ?? [])])]
      : c.req.path.startsWith('/public/')
        ? [...configuredOrigins, ...(c.env.PUBLIC_ORIGINS?.split(',') ?? [])]
        : configuredOrigins;
  return cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : ''),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Organization-Id', 'Authorization', 'X-Anonymous-User-Id', 'X-Session-Id'],
  })(c, next);
});
app.get('/health', health);
app.route('/auth', authRoutes);
app.route('/organizations', organizationRoutes);
app.route('/organizations/assets', assetRoutes);
app.route('/admin', adminRoutes);
app.route('/v1', eventRoutes);
app.route('/analytics', analyticsRoutes);
app.route('/experiences', catalogRoutes);
app.route('/experiences', experienceRoutes);
app.route('/channels', channelRoutes);
app.route('/public', publicExperienceRoutes);
app.route('/public', roulettePublicExperienceRoutes);
app.route('/', paymentWebhookRoutes);
app.route('/', commercialRoutes);
app.get('/assets/*', async (c) => {
  const key = c.req.path.slice('/assets/'.length);
  if (!/^organizations\/[A-Za-z0-9_-]+\/(?:experiences\/[A-Za-z0-9_-]+|assets)\/[0-9a-f-]+\.(png|jpg|jpeg|webp|svg)$/.test(key)) return c.notFound();
  const object = await c.env.EXPERIENCE_ASSETS?.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});
app.get('/dev/db-check', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') return c.notFound();
  const result = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM organizations',
  ).first<{ count: number }>();
  return c.json({ database: 'ok', organizations: result?.count ?? 0 });
});
app.get(
  '/dev/events',
  async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development') return c.notFound();
    await next();
  },
  requireAuth,
  requireOrganization,
  async (c) => {
    if (c.env.ENVIRONMENT !== 'development') return c.notFound();
    const o = c.get('organization');
    const q = c.req.query();
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const values: (string | number)[] = [o.id];
    let where = 'organization_id=?';
    if (q.projectId) {
      const p = await c.env.DB.prepare(
        'SELECT id FROM projects WHERE id=? AND organization_id=?',
      )
        .bind(q.projectId, o.id)
        .first();
      if (!p) return c.notFound();
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
            ? [q.applicationId, o.id, q.projectId]
            : [q.applicationId, o.id]),
        )
        .first();
      if (!a) return c.notFound();
      where += ' AND application_id=?';
      values.push(q.applicationId);
    }
    const rows = await c.env.DB.prepare(
      `SELECT id,event_name event,anonymous_user_id userId,session_id sessionId,properties,occurred_at occurredAt FROM events WHERE ${where} ORDER BY occurred_at DESC LIMIT ?`,
    )
      .bind(...values, limit)
      .all<{ properties: string | null }>();
    return c.json(
      rows.results.map((row) => ({
        ...row,
        properties: row.properties ? JSON.parse(row.properties) : null,
      })),
    );
  },
);

app.route('/attention', attentionRoutes);
app.route('/reports', reportsRoutes);
app.route('/', appDataRoutes);
export default app;
