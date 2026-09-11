import { Hono } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import { recordActivityBestEffort } from '../services/activity';
import { assetUrl, cleanOriginalFilename, organizationAssetKey, validateImageFile } from '../services/assets';
import type { Env } from '../index';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

export const assetRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
assetRoutes.use('*', requireAuth, requireOrganization);

const CATEGORY = /^[a-z][a-z0-9_-]{0,39}$/;
const MAX_DISPLAY_NAME = 120;

function error(message: string, code = 'BAD_REQUEST') {
  return { error: { code, message } };
}

function validCategory(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY.test(value);
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function present(row: Record<string, unknown>, origin: string) {
  return {
    id: row.id,
    url: assetUrl(origin, String(row.storageKey)),
    originalFilename: row.originalFilename,
    displayName: row.displayName,
    mimeType: row.mimeType,
    byteSize: Number(row.byteSize),
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const assetSelect = 'SELECT id,storage_key storageKey,original_filename originalFilename,display_name displayName,mime_type mimeType,byte_size byteSize,category,created_at createdAt,updated_at updatedAt FROM organization_assets';

assetRoutes.get('/', requireOrganizationPermission('assets.read'), async (c) => {
  const organizationId = c.get('organization').id;
  const query = c.req.query();
  const requestedLimit = Number(query.limit);
  const requestedOffset = Number(query.offset);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit || 24, 1), 50) : 24;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset || 0, 0) : 0;
  if (query.category !== undefined && !validCategory(query.category)) return c.json(error('Invalid asset category'), 400);
  if (query.search !== undefined && query.search.length > 80) return c.json(error('Search is too long'), 400);
  const values: (string | number)[] = [organizationId];
  let where = 'organization_id=? AND archived_at IS NULL';
  if (query.category) { where += ' AND category=?'; values.push(query.category); }
  if (query.search?.trim()) { where += " AND (display_name LIKE ? ESCAPE '\\' OR original_filename LIKE ? ESCAPE '\\')"; const pattern = likePattern(query.search.trim()); values.push(pattern, pattern); }
  const rows = await c.env.DB.prepare(`${assetSelect} WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...values, limit + 1, offset).all<Record<string, unknown>>();
  return c.json({ items: rows.results.slice(0, limit).map((row) => present(row, new URL(c.req.url).origin)), pagination: { limit, offset, nextOffset: rows.results.length > limit ? offset + limit : null } });
});

assetRoutes.post('/', requireOrganizationPermission('assets.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  const actorId = c.get('user').id;
  const body = await c.req.parseBody().catch(() => null);
  const file = body && body.file instanceof File ? body.file : null;
  if (!file) return c.json(error('A file is required'), 400);
  const category = body && typeof body.category === 'string' && body.category ? body.category : 'image';
  if (!validCategory(category)) return c.json(error('Invalid asset category'), 400);
  const validation = await validateImageFile(file);
  if (!validation.ok) return c.json(error(validation.message), validation.status);
  const rawDisplayName = body && typeof body.display_name === 'string' ? body.display_name : '';
  const requestedDisplayName = rawDisplayName.trim();
  if (requestedDisplayName.length > MAX_DISPLAY_NAME) return c.json(error('Display name must be 1 to 120 characters'), 400);
  const displayName = requestedDisplayName || cleanOriginalFilename(file.name).slice(0, MAX_DISPLAY_NAME);
  if (!displayName) return c.json(error('A display name is required'), 400);
  if (!c.env.EXPERIENCE_ASSETS) return c.json(error('Asset storage is not configured', 'ASSET_STORAGE_UNAVAILABLE'), 503);
  const id = crypto.randomUUID();
  const key = organizationAssetKey(organizationId, id, validation.extension);
  try {
    await c.env.EXPERIENCE_ASSETS.put(key, validation.bytes, { httpMetadata: { contentType: validation.mimeType } });
    const now = Date.now();
    await c.env.DB.prepare('INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, key, cleanOriginalFilename(file.name), displayName, validation.mimeType, validation.bytes.byteLength, category, actorId, now, now).run();
  } catch {
    await c.env.EXPERIENCE_ASSETS.delete(key).catch(() => undefined);
    return c.json(error('No se pudo guardar el archivo', 'ASSET_STORAGE_ERROR'), 503);
  }
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: actorId }, { action: 'asset.uploaded', resourceType: 'asset', resourceId: id, metadata: { displayName, mimeType: validation.mimeType, category } });
  return c.json({ id, url: assetUrl(new URL(c.req.url).origin, key), originalFilename: cleanOriginalFilename(file.name), displayName, mimeType: validation.mimeType, byteSize: validation.bytes.byteLength, category }, 201);
});

assetRoutes.patch('/:id', requireOrganizationPermission('assets.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  const id = c.req.param('id');
  const body = await c.req.json<{ displayName?: unknown }>().catch(() => ({} as { displayName?: unknown }));
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName || displayName.length > MAX_DISPLAY_NAME) return c.json(error('Display name must be 1 to 120 characters'), 400);
  const row = await c.env.DB.prepare(`${assetSelect} WHERE id=? AND organization_id=? AND archived_at IS NULL`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json(error('Asset not found', 'NOT_FOUND'), 404);
  await c.env.DB.prepare('UPDATE organization_assets SET display_name=?,updated_at=? WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(displayName, Date.now(), id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'asset.renamed', resourceType: 'asset', resourceId: id, metadata: { displayName } });
  return c.json(present({ ...row, displayName }, new URL(c.req.url).origin));
});

assetRoutes.delete('/:id', requireOrganizationPermission('assets.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`${assetSelect} WHERE id=? AND organization_id=? AND archived_at IS NULL`).bind(id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json(error('Asset not found', 'NOT_FOUND'), 404);
  const storageKey = String(row.storageKey);
  const reference = await c.env.DB.prepare('SELECT id FROM experiences WHERE organization_id=? AND (draft_config LIKE ? OR published_config LIKE ?) LIMIT 1').bind(organizationId, `%${storageKey}%`, `%${storageKey}%`).first();
  await c.env.DB.prepare('UPDATE organization_assets SET archived_at=?,updated_at=? WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(Date.now(), Date.now(), id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'asset.archived', resourceType: 'asset', resourceId: id, metadata: { displayName: row.displayName, referenced: Boolean(reference) } });
  return c.json({ id, archived: true, referenced: Boolean(reference) });
});
