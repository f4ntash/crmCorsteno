import { Hono } from 'hono';
import type { Context } from 'hono';
import { hashToken } from '../auth/crypto';
import type { Env } from '../index';
import { KNOWN_EVENT_NAMES } from '@corsteno/types';

const knownEvents = new Set<string>(KNOWN_EVENT_NAMES);
type EventBody = { event?: string; userId?: string; sessionId?: string; occurredAt?: number; properties?: Record<string, unknown> };
type Credential = { application_id: string; organization_id: string; project_id: string };
export const eventRoutes = new Hono<{ Bindings: Env }>();

async function resolveCredential(c: Context<{ Bindings: Env }>): Promise<Credential | null> {
  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) return null;
  return c.env.DB.prepare('SELECT a.id application_id,a.organization_id,a.project_id FROM application_credentials x JOIN applications a ON a.id=x.application_id WHERE x.secret_hash=? AND x.status=? AND a.status=?')
    .bind(await hashToken(token), 'active', 'active').first<Credential>();
}

async function insertEvent(c: Context<{ Bindings: Env }>, body: EventBody, credential: Credential): Promise<string | null> {
  if (!body.event || body.event.length > 80 || !knownEvents.has(body.event)) return null;
  if (body.userId && body.userId.length > 200) return null;
  if (body.sessionId && body.sessionId.length > 200) return null;
  if (body.occurredAt !== undefined && (!Number.isFinite(body.occurredAt) || body.occurredAt < 0)) return null;
  if (JSON.stringify(body).length > 32768) return null;
  const id = crypto.randomUUID(); const now = Date.now(); const occurredAt = body.occurredAt ?? now;
  await c.env.DB.prepare('INSERT INTO events (id,organization_id,project_id,application_id,event_name,anonymous_user_id,session_id,properties,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, credential.organization_id, credential.project_id, credential.application_id, body.event, body.userId ?? null, body.sessionId ?? null, body.properties ? JSON.stringify(body.properties) : null, occurredAt, now).run();
  return id;
}

eventRoutes.post('/events', async c => { const credential = await resolveCredential(c); if (!credential) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid application credential' } }, 401); const body: EventBody = await c.req.json().catch(() => ({} as EventBody)); const eventId = await insertEvent(c, body, credential); if (!eventId) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid event payload' } }, 400); return c.json({ ok: true, eventId }, 201); });
eventRoutes.post('/events/batch', async c => { const credential = await resolveCredential(c); if (!credential) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid application credential' } }, 401); const body: { events?: EventBody[] } = await c.req.json().catch(() => ({} as { events?: EventBody[] })); if (!body.events || body.events.length > 50) return c.json({ error: { code: 'BAD_REQUEST', message: 'Maximum 50 events' } }, 400); const eventIds: string[] = []; for (const event of body.events) { const id = await insertEvent(c, event, credential); if (!id) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid event payload' } }, 400); eventIds.push(id); } return c.json({ ok: true, eventIds }, 201); });
