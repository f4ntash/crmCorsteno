import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import { recordActivityBestEffort } from '../services/activity';
import { normalizeChannelUrl } from '../services/channel-origins';
import { channelProduct, getChannelProducts, linkProductToChannel, reorderChannelProducts, unlinkProductFromChannel, updateChannelProduct } from '../services/channel-products';
import { getOrganizationProduct } from '../services/organization-products';
import type { Env } from '../index';

export const CHANNEL_TYPES = ['external_site', 'corsteno_site', 'hosted_runtime'] as const;
export type ChannelType = typeof CHANNEL_TYPES[number];
export type ChannelStatus = 'active' | 'inactive';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

type ChannelRow = {
  id: string;
  organizationId: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  url: string | null;
  createdAt: number;
  updatedAt: number;
  publicKey: string | null;
};

type LinkedExperience = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

const channelSelect = `SELECT id,organization_id organizationId,name,type,status,url,public_key publicKey,created_at createdAt,updated_at updatedAt FROM channels`;

export const channelRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
channelRoutes.use('*', requireAuth, requireOrganization);
channelRoutes.use('*', async (c, next) => {
  const permission = c.req.method === 'GET' ? 'crm.read' : 'crm.manage';
  const authorize = requireOrganizationPermission(permission) as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
  return authorize(c, next);
});

function bad(message: string) {
  return cjson({ error: { code: 'BAD_REQUEST', message } }, 400);
}

function cjson(value: unknown, status?: number) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function isChannelType(value: unknown): value is ChannelType {
  return typeof value === 'string' && CHANNEL_TYPES.includes(value as ChannelType);
}

function parseUrl(value: unknown, required: boolean) {
  if (value === undefined || value === null) {
    return required ? { error: 'Ingresá una URL válida con http:// o https://.' } : { value: null };
  }
  if (typeof value !== 'string') return { error: 'La URL debe ser texto.' };
  const normalized = normalizeChannelUrl(value);
  if (!normalized && (required || value.trim())) return { error: 'Ingresá una URL válida con http:// o https://.' };
  return { value: normalized };
}

function present(row: Record<string, unknown>): ChannelRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    type: row.type as ChannelType,
    status: row.status as ChannelStatus,
    url: typeof row.url === 'string' ? row.url : null,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    publicKey: typeof row.publicKey === 'string' ? row.publicKey : null,
  };
}

async function getChannel(db: D1Database, id: string, organizationId: string) {
  return db.prepare(`${channelSelect} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
}

async function getDetail(db: D1Database, id: string, organizationId: string) {
  const row = await getChannel(db, id, organizationId);
  if (!row) return null;
  const experiences = await db.prepare(`SELECT e.id,e.name,e.slug,e.type,e.status,e.starts_at startsAt,e.ends_at endsAt FROM experience_channels ec JOIN experiences e ON e.id=ec.experience_id AND e.organization_id=ec.organization_id WHERE ec.channel_id=? AND ec.organization_id=? ORDER BY e.name,e.id`).bind(id, organizationId).all<LinkedExperience>();
  return { ...present(row), experiences: experiences.results, products: await getChannelProducts(db, id, organizationId) };
}

channelRoutes.get('/', async (c) => {
  const organizationId = c.get('organization').id;
  const rows = await c.env.DB.prepare(`SELECT c.id,c.organization_id organizationId,c.name,c.type,c.status,c.url,c.public_key publicKey,c.created_at createdAt,c.updated_at updatedAt,COUNT(ec.experience_id) linkedExperienceCount FROM channels c LEFT JOIN experience_channels ec ON ec.channel_id=c.id AND ec.organization_id=c.organization_id WHERE c.organization_id=? GROUP BY c.id,c.organization_id,c.name,c.type,c.status,c.url,c.public_key,c.created_at,c.updated_at ORDER BY CASE WHEN c.status='active' THEN 0 ELSE 1 END,c.name,c.id`).bind(organizationId).all<Record<string, unknown>>();
  return c.json(rows.results.map((row) => ({ ...present(row), linkedExperienceCount: Number(row.linkedExperienceCount ?? 0) })));
});

channelRoutes.post('/', async (c) => {
  const organizationId = c.get('organization').id;
  const body = await c.req.json<{ name?: unknown; type?: unknown; url?: unknown }>().catch(() => ({} as { name?: unknown; type?: unknown; url?: unknown }));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) return bad('El nombre debe tener entre 2 y 120 caracteres.');
  if (!isChannelType(body.type)) return bad('Elegí un tipo de sitio o canal válido.');
  const type = body.type;
  if (type === 'hosted_runtime' && body.url !== undefined && body.url !== null && typeof body.url === 'string' && body.url.trim()) return bad('El canal alojado por Corsteno no necesita una URL.');
  const parsedUrl = parseUrl(body.url, type === 'external_site');
  if (parsedUrl.error) return bad(parsedUrl.error);
  const now = Date.now();
  const id = crypto.randomUUID();
  const publicKey = `site_${crypto.randomUUID().replaceAll('-', '')}`;
  try {
    const insert = c.env.DB.prepare('INSERT INTO channels (id,organization_id,name,type,status,url,created_at,updated_at) VALUES (?,?,?,? ,\'active\',?,?,?)').bind(id, organizationId, name, type, parsedUrl.value, now, now);
    const keyUpdate = c.env.DB.prepare('UPDATE channels SET public_key=? WHERE id=? AND organization_id=?').bind(publicKey, id, organizationId);
    if (typeof c.env.DB.batch === 'function') await c.env.DB.batch([insert, keyUpdate]);
    else { await insert.run(); await keyUpdate.run(); }
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return c.json({ error: { code: 'CHANNEL_NAME_CONFLICT', message: 'Ya existe un sitio o canal con ese nombre en esta organización.' } }, 409);
    throw error;
  }
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.created', resourceType: 'channel', resourceId: id, metadata: { name, type } });
  const detail = await getDetail(c.env.DB, id, organizationId);
  return c.json(detail, 201);
});

channelRoutes.get('/:id', async (c) => {
  const detail = await getDetail(c.env.DB, c.req.param('id'), c.get('organization').id);
  if (!detail) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  return c.json(detail);
});

channelRoutes.patch('/:id', async (c) => {
  const organizationId = c.get('organization').id;
  const id = c.req.param('id');
  const current = await getChannel(c.env.DB, id, organizationId);
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const body = await c.req.json<{ name?: unknown; url?: unknown; status?: unknown }>().catch(() => ({} as { name?: unknown; url?: unknown; status?: unknown }));
  const fields: string[] = [];
  const values: unknown[] = [];
  const name = 'name' in body ? typeof body.name === 'string' ? body.name.trim() : '' : String(current.name);
  if ('name' in body && (name.length < 2 || name.length > 120)) return bad('El nombre debe tener entre 2 y 120 caracteres.');
  if ('name' in body) { fields.push('name=?'); values.push(name); }
  if ('status' in body) {
    if (body.status !== 'active' && body.status !== 'inactive') return bad('El estado del canal no es válido.');
    fields.push('status=?'); values.push(body.status);
  }
  if ('url' in body) {
    if (current.type === 'hosted_runtime' && body.url !== null && body.url !== undefined && (typeof body.url !== 'string' || body.url.trim())) return bad('El canal alojado por Corsteno no necesita una URL.');
    const parsedUrl = parseUrl(body.url, current.type === 'external_site');
    if (parsedUrl.error) return bad(parsedUrl.error);
    fields.push('url=?'); values.push(parsedUrl.value);
  }
  if (!fields.length) return bad('No hay cambios para guardar.');
  fields.push('updated_at=?'); values.push(Date.now());
  try {
    await c.env.DB.prepare(`UPDATE channels SET ${fields.join(',')} WHERE id=? AND organization_id=?`).bind(...values, id, organizationId).run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return c.json({ error: { code: 'CHANNEL_NAME_CONFLICT', message: 'Ya existe un sitio o canal con ese nombre en esta organización.' } }, 409);
    throw error;
  }
  const nextStatus = 'status' in body ? body.status : current.status;
  const action = nextStatus !== current.status ? nextStatus === 'active' ? 'channel.activated' : 'channel.deactivated' : 'channel.updated';
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action, resourceType: 'channel', resourceId: id, metadata: { name, type: current.type } });
  const detail = await getDetail(c.env.DB, id, organizationId);
  return c.json(detail);
});

channelRoutes.post('/:id/experiences', async (c) => {
  const organizationId = c.get('organization').id;
  const channelId = c.req.param('id');
  const channel = await getChannel(c.env.DB, channelId, organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const body = await c.req.json<{ experienceId?: unknown }>().catch(() => ({} as { experienceId?: unknown }));
  if (typeof body.experienceId !== 'string' || !body.experienceId.trim()) return bad('Elegí una experiencia válida.');
  const experienceId = body.experienceId.trim();
  const experience = await c.env.DB.prepare('SELECT id,name FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first<{ id: string; name: string }>();
  if (!experience) return c.json({ error: { code: 'NOT_FOUND', message: 'La experiencia no pertenece a esta organización.' } }, 404);
  const result = await c.env.DB.prepare('INSERT OR IGNORE INTO experience_channels (id,organization_id,experience_id,channel_id,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, experienceId, channelId, Date.now()).run();
  if (result.meta?.changes) await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.experience.linked', resourceType: 'channel', resourceId: channelId, metadata: { channelName: channel.name, experienceName: experience.name } });
  const detail = await getDetail(c.env.DB, channelId, organizationId);
  return c.json(detail);
});

channelRoutes.delete('/:id/experiences/:experienceId', async (c) => {
  const organizationId = c.get('organization').id;
  const channelId = c.req.param('id');
  const channel = await getChannel(c.env.DB, channelId, organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const experience = await c.env.DB.prepare('SELECT id,name FROM experiences WHERE id=? AND organization_id=?').bind(c.req.param('experienceId'), organizationId).first<{ id: string; name: string }>();
  if (!experience) return c.json({ error: { code: 'NOT_FOUND', message: 'La experiencia no pertenece a esta organización.' } }, 404);
  const result = await c.env.DB.prepare('DELETE FROM experience_channels WHERE organization_id=? AND channel_id=? AND experience_id=?').bind(organizationId, channelId, experience.id).run();
  if (!result.meta?.changes) return c.json({ error: { code: 'NOT_FOUND', message: 'La experiencia no está conectada a este canal.' } }, 404);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.experience.unlinked', resourceType: 'channel', resourceId: channelId, metadata: { channelName: channel.name, experienceName: experience.name } });
  const detail = await getDetail(c.env.DB, channelId, organizationId);
  return c.json(detail);
});

channelRoutes.get('/:id/products', async (c) => {
  const channel = await getChannel(c.env.DB, c.req.param('id'), c.get('organization').id);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  return c.json(await getChannelProducts(c.env.DB, c.req.param('id'), c.get('organization').id));
});

channelRoutes.post('/:id/products/reorder', async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const channelId = String(channel.id);
  const body = await c.req.json().catch(() => ({} as unknown)) as { productIds?: unknown };
  if (!Array.isArray(body.productIds) || body.productIds.some((id) => typeof id !== 'string')) return bad('Elegí un orden válido de productos.');
  const products = await getChannelProducts(c.env.DB, channelId, organizationId);
  const currentIds = products.draft.map((product) => product.id);
  const productIds = body.productIds as string[];
  if (productIds.length !== currentIds.length || new Set(productIds).size !== productIds.length || productIds.some((id) => !currentIds.includes(id))) return bad('El orden debe incluir los productos conectados.');
  await reorderChannelProducts(c.env.DB, channelId, organizationId, productIds);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.products.reordered', resourceType: 'channel', resourceId: channelId, metadata: { channelName: String(channel.name) } });
  return c.json(await getDetail(c.env.DB, channelId, organizationId));
});

channelRoutes.post('/:id/products', async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const channelId = String(channel.id);
  const body = await c.req.json().catch(() => ({} as unknown)) as { productId?: unknown; visible?: unknown };
  if (typeof body.productId !== 'string' || !body.productId.trim()) return bad('Elegí un producto válido.');
  const product = await getOrganizationProduct(c.env.DB, organizationId, body.productId.trim(), '');
  if (!product || product.status !== 'active') return c.json({ error: { code: 'NOT_FOUND', message: 'El producto no pertenece a esta organización o está archivado.' } }, 404);
  const linked = await linkProductToChannel(c.env.DB, channelId, organizationId, product.id, body.visible !== false);
  if (!linked) return c.json({ error: { code: 'PRODUCT_LINK_FAILED', message: 'No se pudo conectar el producto.' } }, 409);
  if (linked.id) await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.product.linked', resourceType: 'channel', resourceId: channelId, metadata: { channelName: String(channel.name), productName: product.name } });
  return c.json(await getDetail(c.env.DB, channelId, organizationId));
});

channelRoutes.patch('/:id/products/:productId', async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const channelId = String(channel.id);
  const body = await c.req.json().catch(() => ({} as unknown)) as { visible?: unknown };
  if (typeof body.visible !== 'boolean') return bad('La visibilidad del producto no es válida.');
  const existing = await channelProduct(c.env.DB, channelId, organizationId, c.req.param('productId'));
  if (!existing) return c.json({ error: { code: 'NOT_FOUND', message: 'El producto no está conectado a este sitio.' } }, 404);
  await updateChannelProduct(c.env.DB, channelId, organizationId, c.req.param('productId'), body.visible);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.product.visibility_changed', resourceType: 'channel', resourceId: channelId, metadata: { channelName: String(channel.name), productName: existing.name, visible: body.visible } });
  return c.json(await getDetail(c.env.DB, channelId, organizationId));
});

channelRoutes.delete('/:id/products/:productId', async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return c.json({ error: { code: 'NOT_FOUND', message: 'Sitio o canal no encontrado.' } }, 404);
  const channelId = String(channel.id);
  const existing = await channelProduct(c.env.DB, channelId, organizationId, c.req.param('productId'));
  if (!existing || !await unlinkProductFromChannel(c.env.DB, channelId, organizationId, c.req.param('productId'))) return c.json({ error: { code: 'NOT_FOUND', message: 'El producto no está conectado a este sitio.' } }, 404);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.product.unlinked', resourceType: 'channel', resourceId: channelId, metadata: { channelName: String(channel.name), productName: existing.name } });
  return c.json(await getDetail(c.env.DB, channelId, organizationId));
});
