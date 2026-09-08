import { Hono } from 'hono';
import { requireAuth, requireOrganization } from '../auth/middleware';
import type { Env } from '../index';
import { getEffectiveExperienceStatus, type PersistedExperienceStatus } from '../services/experience-status';

const STATUSES = ['draft', 'published', 'paused'] as const;
type ExperienceStatus = PersistedExperienceStatus;
type JsonValue = Record<string, unknown> | unknown[];
export type Experience = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  type: string;
  status: ExperienceStatus;
  effective_status: string;
  schemaVersion: number;
  draftConfig: JsonValue | null;
  publishedConfig: JsonValue | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrizeConfig = { id: string; name: string; iconUrl?: string | null };
export type DraftConfig = { schemaVersion: 1; backgroundColor: string; prizes: PrizeConfig[]; segments: Array<{ id: string; color: string; prizeId: string | null }> };

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

export const experienceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
experienceRoutes.use('*', requireAuth, requireOrganization);

const select = `SELECT id, organization_id organizationId, name, slug, type, status,
  schema_version schemaVersion, draft_config draftConfig, published_config publishedConfig,
  starts_at startsAt, ends_at endsAt, created_at createdAt, updated_at updatedAt
  FROM experiences`;

export function parseJson(value: string | null): JsonValue | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    return parsed as JsonValue;
  } catch {
    throw new Error('invalid stored JSON');
  }
}

function present(row: Record<string, unknown>): Experience {
  const startsAt = row.startsAt as string | null;
  const endsAt = row.endsAt as string | null;
  return {
    ...row,
    draftConfig: parseJson(row.draftConfig as string | null),
    publishedConfig: parseJson(row.publishedConfig as string | null),
    effective_status: getEffectiveExperienceStatus(row.status as ExperienceStatus, startsAt, endsAt),
  } as Experience;
}

function datesValid(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  return !(startsAt && endsAt) || new Date(endsAt).getTime() > new Date(startsAt).getTime();
}

function bad(message: string) {
  return { error: { code: 'BAD_REQUEST', message } };
}
const HEX = /^#[0-9a-f]{6}$/i;
const ASSET_PATH = /^\/assets\/organizations\/[A-Za-z0-9_-]+\/experiences\/[A-Za-z0-9_-]+\/[0-9a-f-]+\.(png|svg)$/;
export function validAssetUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  if (ASSET_PATH.test(value)) return true;
  try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && ASSET_PATH.test(url.pathname) && !url.username && !url.password; } catch { return false; }
}
export function validDraftConfig(value: unknown): value is DraftConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (config.schemaVersion !== 1 || typeof config.backgroundColor !== 'string' || !HEX.test(config.backgroundColor) || !Array.isArray(config.prizes) || config.prizes.length < 1 || config.prizes.length > 5 || !Array.isArray(config.segments) || config.segments.length < 6 || config.segments.length > 10) return false;
  const ids = new Set<string>();
  for (const prize of config.prizes) { if (typeof prize !== 'object' || prize === null || Array.isArray(prize)) return false; const item = prize as Record<string, unknown>; if (typeof item.id !== 'string' || ids.has(item.id) || !item.id || typeof item.name !== 'string' || !item.name.trim() || (item.iconUrl !== undefined && item.iconUrl !== null && !validAssetUrl(item.iconUrl))) return false; ids.add(item.id); }
  const segmentIds = new Set<string>();
  return config.segments.every((segment) => { if (typeof segment !== 'object' || segment === null || Array.isArray(segment)) return false; const item = segment as Record<string, unknown>; return typeof item.id === 'string' && !segmentIds.has(item.id) && !!segmentIds.add(item.id) && typeof item.color === 'string' && HEX.test(item.color) && (item.prizeId === null || (typeof item.prizeId === 'string' && ids.has(item.prizeId))); });
}

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export function sanitizeSvg(value: string) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(value) || !/<\/svg>\s*$/i.test(value)) return null;
  if (/<\/?script\b|<\/?foreignObject\b|<\/?iframe\b|<\/?object\b|<\/?embed\b|<!DOCTYPE\b|<!ENTITY\b|\son[a-z0-9_-]+\s*=|(?:href|src|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)|url\s*\(/i.test(value)) return null;
  return value;
}

experienceRoutes.post('/:id/assets', async (c) => {
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT id FROM experiences WHERE id=? AND organization_id=?').bind(id, c.get('organization').id).first();
  if (!exists) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const body = await c.req.parseBody().catch(() => null);
  const file = body && body.file instanceof File ? body.file : null;
  if (!file) return c.json(bad('A file is required'), 400);
  if (file.size > MAX_ASSET_BYTES) return c.json(bad('File exceeds the 2 MB limit'), 413);
  if (file.type !== 'image/png' && file.type !== 'image/svg+xml') return c.json(bad('Only PNG and SVG files are allowed'), 415);
  let bytes: ArrayBuffer;
  let extension: 'png' | 'svg';
  if (file.type === 'image/png') {
    bytes = await file.arrayBuffer();
    const signature = new Uint8Array(bytes.slice(0, PNG_SIGNATURE.length));
    if (signature.length !== PNG_SIGNATURE.length || !PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) return c.json(bad('Invalid PNG file'), 400);
    extension = 'png';
  } else {
    const text = await file.text();
    const safe = sanitizeSvg(text);
    if (!safe) return c.json(bad('SVG contains unsupported or executable content'), 400);
    bytes = new TextEncoder().encode(safe).buffer;
    extension = 'svg';
  }
  const key = `organizations/${c.get('organization').id}/experiences/${id}/${crypto.randomUUID()}.${extension}`;
  if (!c.env.EXPERIENCE_ASSETS) return c.json({ error: { code: 'ASSET_STORAGE_UNAVAILABLE', message: 'Asset storage is not configured' } }, 503);
  await c.env.EXPERIENCE_ASSETS.put(key, bytes, { httpMetadata: { contentType: file.type } });
  return c.json({ url: `${new URL(c.req.url).origin}/assets/${key}`, key }, 201);
});

experienceRoutes.post('/:id/publish', async (c) => {
  const id = c.req.param('id');
  const organizationId = c.get('organization').id;
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const draft = parseJson(row.draftConfig as string | null);
  if (!validDraftConfig(draft)) return c.json(bad('Invalid roulette draft_config'), 400);
  const snapshot = JSON.stringify(draft);
  await c.env.DB.prepare('UPDATE experiences SET published_config=?, status=\'published\', updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?').bind(snapshot, id, organizationId).run();
  const published = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  try { return c.json(present(published ?? {})); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid published experience JSON' } }, 500); }
});

experienceRoutes.post('/', async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = body.type === undefined ? 'roulette' : body.type;
  const startsAt = body.starts_at === null ? null : typeof body.starts_at === 'string' ? body.starts_at : undefined;
  const endsAt = body.ends_at === null ? null : typeof body.ends_at === 'string' ? body.ends_at : undefined;
  if (!name) return c.json(bad('name is required'), 400);
  if (typeof type !== 'string' || !datesValid(startsAt, endsAt)) return c.json(bad('ends_at must be greater than starts_at'), 400);
  if ((startsAt && Number.isNaN(new Date(startsAt).getTime())) || (endsAt && Number.isNaN(new Date(endsAt).getTime()))) return c.json(bad('Invalid date'), 400);
  const id = crypto.randomUUID();
  const slug = crypto.randomUUID();
  const draftConfig = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', segments: [] });
  await c.env.DB.prepare(`INSERT INTO experiences (id, organization_id, name, slug, type, status, schema_version, draft_config, published_config, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, NULL, ?, ?)`)
    .bind(id, c.get('organization').id, name, slug, type, draftConfig, startsAt ?? null, endsAt ?? null).run();
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(id, c.get('organization').id).first<Record<string, unknown>>();
  return c.json(present(row ?? {}), 201);
});

experienceRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`${select} WHERE organization_id=? ORDER BY created_at DESC`).bind(c.get('organization').id).all<Record<string, unknown>>();
  try { return c.json(rows.results.map(present)); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  try { return c.json(present(row)); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.patch('/:id', async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const current = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  const allowed: Array<[string, string]> = [['name', 'name'], ['starts_at', 'starts_at'], ['ends_at', 'ends_at'], ['status', 'status'], ['draft_config', 'draft_config']];
  const fields: string[] = [], values: unknown[] = [];
  for (const [key, column] of allowed) if (key in body) {
    if (key === 'name' && (typeof body[key] !== 'string' || !(body[key] as string).trim())) return c.json(bad('name must be a non-empty string'), 400);
    if (key === 'status' && (typeof body[key] !== 'string' || !STATUSES.includes(body[key] as ExperienceStatus))) return c.json(bad('Invalid status'), 400);
    if (key === 'draft_config') { if (!validDraftConfig(body[key])) return c.json(bad('Invalid roulette draft_config'), 400); values.push(JSON.stringify(body[key])); } else values.push(body[key]);
    fields.push(`${column}=?`);
  }
  const starts = ('starts_at' in body ? body.starts_at : current.startsAt) as string | null;
  const ends = ('ends_at' in body ? body.ends_at : current.endsAt) as string | null;
  if (!datesValid(starts, ends)) return c.json(bad('ends_at must be greater than starts_at'), 400);
  if (!fields.length) return c.json(bad('No editable fields provided'), 400);
  fields.push('updated_at=CURRENT_TIMESTAMP');
  await c.env.DB.prepare(`UPDATE experiences SET ${fields.join(', ')} WHERE id=? AND organization_id=?`).bind(...values, c.req.param('id'), c.get('organization').id).run();
  const row = await c.env.DB.prepare(`${select} WHERE id=? AND organization_id=?`).bind(c.req.param('id'), c.get('organization').id).first<Record<string, unknown>>();
  try { return c.json(present(row ?? {})); } catch { return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Invalid stored experience JSON' } }, 500); }
});

experienceRoutes.delete('/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM experiences WHERE id=? AND organization_id=?').bind(c.req.param('id'), c.get('organization').id).run();
  if (!result.meta?.changes) return c.json({ error: { code: 'NOT_FOUND', message: 'Experience not found' } }, 404);
  return c.body(null, 204);
});
