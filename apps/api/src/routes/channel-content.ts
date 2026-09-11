import { Hono } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import { recordActivityBestEffort } from '../services/activity';
import { defaultSiteContent, SITE_CONTENT_PROFILE, SITE_CONTENT_PROFILE_KEY, SITE_CONTENT_PROFILE_VERSION, validateSiteContent, type SiteContent } from '../services/site-content';
import type { Env } from '../index';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

type Channel = { id: string; organizationId: string; name: string; type: 'external_site' | 'corsteno_site' | 'hosted_runtime' };
type ContentRow = { channelId: string; organizationId: string; profileKey: string; profileVersion: number; draftContent: string; publishedContent: string | null; publishedAt: number | null; createdAt: number; updatedAt: number };

export const channelContentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
channelContentRoutes.use('*', requireAuth, requireOrganization);

const channelSelect = 'SELECT id,organization_id organizationId,name,type FROM channels';
const contentSelect = 'SELECT channel_id channelId,organization_id organizationId,profile_key profileKey,profile_version profileVersion,draft_content draftContent,published_content publishedContent,published_at publishedAt,created_at createdAt,updated_at updatedAt FROM channel_content';

function errorResponse(message: string, code: string, status: 400 | 403 | 404 | 409 | 422 | 500 = 400, issues?: unknown) {
  return new Response(JSON.stringify({ error: { code, message, ...(issues ? { issues } : {}) } }), { status, headers: { 'Content-Type': 'application/json' } });
}

function isPlatformOperator(user: Variables['user']) {
  return user.platformRole === 'super_admin' || user.platformRole === 'corsteno_admin';
}

async function getChannel(db: D1Database, id: string, organizationId: string) {
  return db.prepare(`${channelSelect} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Channel>();
}

async function getContent(db: D1Database, channelId: string, organizationId: string) {
  return db.prepare(`${contentSelect} WHERE channel_id=? AND organization_id=?`).bind(channelId, organizationId).first<ContentRow>();
}

function parseStoredContent(value: string | null): SiteContent | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SiteContent;
  } catch {
    return null;
  }
}

function responseBody(channel: Channel, row: ContentRow | null) {
  const draftContent = row ? parseStoredContent(row.draftContent) : null;
  const publishedContent = row ? parseStoredContent(row.publishedContent) : null;
  return {
    supported: channel.type !== 'hosted_runtime',
    channel: { id: channel.id, name: channel.name, type: channel.type },
    profile: row?.profileKey === SITE_CONTENT_PROFILE_KEY && row.profileVersion === SITE_CONTENT_PROFILE_VERSION ? SITE_CONTENT_PROFILE : null,
    draftContent,
    publishedContent,
    publishedAt: row?.publishedAt ?? null,
    hasUnpublishedChanges: Boolean(row && (!publishedContent || JSON.stringify(draftContent) !== JSON.stringify(publishedContent))),
  };
}

channelContentRoutes.get('/:id/content', requireOrganizationPermission('crm.read'), async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return errorResponse('Sitio o canal no encontrado.', 'NOT_FOUND', 404);
  const row = await getContent(c.env.DB, channel.id, organizationId);
  return c.json(responseBody(channel, row));
});

channelContentRoutes.put('/:id/content-profile', requireOrganizationPermission('crm.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  if (!isPlatformOperator(c.get('user'))) return errorResponse('Solo el equipo de Corsteno puede preparar este perfil.', 'FORBIDDEN', 403);
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return errorResponse('Sitio o canal no encontrado.', 'NOT_FOUND', 404);
  if (channel.type === 'hosted_runtime') return errorResponse('El canal alojado usa la configuración de la experiencia.', 'CONTENT_NOT_SUPPORTED', 409);
  const body = await c.req.json<{ profileKey?: unknown }>().catch(() => ({} as { profileKey?: unknown }));
  if (body.profileKey !== SITE_CONTENT_PROFILE_KEY) return errorResponse('Elegí un perfil de contenido disponible.', 'CONTENT_PROFILE_INVALID', 400);
  const existing = await getContent(c.env.DB, channel.id, organizationId);
  if (existing) {
    if (existing.profileKey !== SITE_CONTENT_PROFILE_KEY || existing.profileVersion !== SITE_CONTENT_PROFILE_VERSION) return errorResponse('Este canal ya tiene un perfil de contenido que no se puede cambiar.', 'CONTENT_PROFILE_CHANGE_BLOCKED', 409);
    return c.json(responseBody(channel, existing));
  }
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO channel_content (channel_id,organization_id,profile_key,profile_version,draft_content,published_content,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(channel.id, organizationId, SITE_CONTENT_PROFILE_KEY, SITE_CONTENT_PROFILE_VERSION, JSON.stringify(defaultSiteContent()), null, null, now, now).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.content_profile.assigned', resourceType: 'channel', resourceId: channel.id, metadata: { channelName: channel.name, profile: SITE_CONTENT_PROFILE.name } });
  return c.json(responseBody(channel, await getContent(c.env.DB, channel.id, organizationId)), 201);
});

channelContentRoutes.patch('/:id/content', requireOrganizationPermission('crm.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return errorResponse('Sitio o canal no encontrado.', 'NOT_FOUND', 404);
  if (channel.type === 'hosted_runtime') return errorResponse('El canal alojado usa la configuración de la experiencia.', 'CONTENT_NOT_SUPPORTED', 409);
  const row = await getContent(c.env.DB, channel.id, organizationId);
  if (!row || row.profileKey !== SITE_CONTENT_PROFILE_KEY || row.profileVersion !== SITE_CONTENT_PROFILE_VERSION) return errorResponse('Este canal todavía no tiene un perfil de contenido preparado.', 'CONTENT_PROFILE_NOT_ASSIGNED', 409);
  const body = await c.req.json<{ content?: unknown }>().catch(() => ({} as { content?: unknown }));
  const bodyKeys = Object.keys(body as Record<string, unknown>);
  if (bodyKeys.some((key) => key !== 'content') || !('content' in body)) return errorResponse('Enviá el contenido del perfil actual.', 'CONTENT_INVALID', 400);
  const validation = await validateSiteContent(c.env.DB, organizationId, new URL(c.req.url).origin, body.content);
  if (!validation.ok) return errorResponse('El contenido tiene campos inválidos.', 'INVALID_CONTENT', 422, validation.issues);
  const now = Date.now();
  await c.env.DB.prepare('UPDATE channel_content SET draft_content=?,updated_at=? WHERE channel_id=? AND organization_id=?').bind(JSON.stringify(validation.value), now, channel.id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.content.draft_updated', resourceType: 'channel', resourceId: channel.id, metadata: { channelName: channel.name, profile: SITE_CONTENT_PROFILE.name } });
  return c.json(responseBody(channel, await getContent(c.env.DB, channel.id, organizationId)));
});

channelContentRoutes.post('/:id/content/publish', requireOrganizationPermission('crm.manage'), async (c) => {
  const organizationId = c.get('organization').id;
  const channel = await getChannel(c.env.DB, c.req.param('id'), organizationId);
  if (!channel) return errorResponse('Sitio o canal no encontrado.', 'NOT_FOUND', 404);
  if (channel.type === 'hosted_runtime') return errorResponse('El canal alojado usa la configuración de la experiencia.', 'CONTENT_NOT_SUPPORTED', 409);
  const row = await getContent(c.env.DB, channel.id, organizationId);
  if (!row || row.profileKey !== SITE_CONTENT_PROFILE_KEY || row.profileVersion !== SITE_CONTENT_PROFILE_VERSION) return errorResponse('Este canal todavía no tiene un perfil de contenido preparado.', 'CONTENT_PROFILE_NOT_ASSIGNED', 409);
  const draft = parseStoredContent(row.draftContent);
  const validation = await validateSiteContent(c.env.DB, organizationId, new URL(c.req.url).origin, draft);
  if (!validation.ok) return errorResponse('El contenido tiene campos inválidos.', 'INVALID_CONTENT', 422, validation.issues);
  const now = Date.now();
  await c.env.DB.prepare('UPDATE channel_content SET published_content=?,published_at=?,updated_at=? WHERE channel_id=? AND organization_id=?').bind(JSON.stringify(validation.value), now, now, channel.id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'channel.content.published', resourceType: 'channel', resourceId: channel.id, metadata: { channelName: channel.name, profile: SITE_CONTENT_PROFILE.name } });
  return c.json(responseBody(channel, await getContent(c.env.DB, channel.id, organizationId)));
});
