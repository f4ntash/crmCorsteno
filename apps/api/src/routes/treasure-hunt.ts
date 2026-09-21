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
const readPermission = requireOrganizationPermission('crm.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
const managePermission = requireOrganizationPermission('crm.manage') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
const redemptionPermission = requireOrganizationPermission('claims.redeem') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
type UpstreamPermission = 'crm.read' | 'crm.manage';

async function forward(c: Parameters<MiddlewareHandler>[0], path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', permission: UpstreamPermission = 'crm.read') {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_ADMIN_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const requestBody = method === 'GET' ? undefined : await c.req.text();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': c.get('organization').id,
      'X-CRM-Permissions': permission,
    };
    const contentType = c.req.header('Content-Type');
    const ifMatch = c.req.header('If-Match');
    const idempotencyKey = c.req.header('Idempotency-Key');
    if (contentType) headers['Content-Type'] = contentType;
    if (ifMatch) headers['If-Match'] = ifMatch;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: requestBody,
    });
    const responseBody = await response.text();
    const responseHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    const etag = response.headers.get('ETag');
    if (etag) responseHeaders.set('ETag', etag);
    if (response.status === 404) return c.json({ error: { code: 'NOT_FOUND', message: 'Campaña no encontrada.' } }, 404);
    if (!response.ok && response.status >= 400 && response.status < 500) return new Response(responseBody, { status: response.status, headers: responseHeaders });
    if (!response.ok) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
    return new Response(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

async function forwardTargetUpload(c: Parameters<MiddlewareHandler>[0], path: string) {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_ADMIN_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return c.json({ error: { code: 'TARGET_FILE_REQUIRED', message: 'Seleccioná una imagen objetivo.' } }, 422);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': c.get('organization').id,
      'X-CRM-Permissions': 'crm.manage',
      'Content-Type': file.type || 'application/octet-stream',
      'X-Original-Filename': file.name,
    };
    const width = form.get('physicalWidthCm');
    if (typeof width === 'string') headers['X-Physical-Width-Cm'] = width;
    const ifMatch = c.req.header('If-Match');
    const idempotencyKey = c.req.header('Idempotency-Key');
    if (ifMatch) headers['If-Match'] = ifMatch;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: await file.arrayBuffer() });
    const responseBody = await response.text();
    const responseHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    const etag = response.headers.get('ETag');
    if (etag) responseHeaders.set('ETag', etag);
    if (response.status === 404) return c.json({ error: { code: 'NOT_FOUND', message: 'Campaña o paso no encontrado.' } }, 404);
    if (!response.ok && response.status >= 400 && response.status < 500) return new Response(responseBody, { status: response.status, headers: responseHeaders });
    if (!response.ok) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
    return new Response(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

async function forwardTargetPreview(c: Parameters<MiddlewareHandler>[0], path: string) {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_ADMIN_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': c.get('organization').id, 'X-CRM-Permissions': 'crm.read' } });
    if (!response.ok) return c.json({ error: { code: 'NOT_FOUND', message: 'Imagen objetivo no encontrada.' } }, response.status === 404 ? 404 : 503);
    return new Response(response.body, { status: 200, headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

async function forwardCompiledArtifact(c: Parameters<MiddlewareHandler>[0], path: string) {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_ADMIN_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Organization-Id': c.get('organization').id,
      'X-CRM-Permissions': 'crm.manage',
      'Content-Type': c.req.header('Content-Type') ?? 'application/octet-stream',
    };
    const ifMatch = c.req.header('If-Match');
    const idempotencyKey = c.req.header('Idempotency-Key');
    if (ifMatch) headers['If-Match'] = ifMatch;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: await c.req.arrayBuffer() });
    const responseBody = await response.text();
    const responseHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    const etag = response.headers.get('ETag');
    if (etag) responseHeaders.set('ETag', etag);
    if (response.status === 404) return c.json({ error: { code: 'NOT_FOUND', message: 'Compilación no encontrada.' } }, 404);
    if (!response.ok && response.status >= 400 && response.status < 500) return new Response(responseBody, { status: response.status, headers: responseHeaders });
    if (!response.ok) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
    return new Response(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

async function forwardRedemption(c: Parameters<MiddlewareHandler>[0]) {
  const baseUrl = c.env.TREASURE_HUNT_ADMIN_API_URL?.replace(/\/+$/, '');
  const token = c.env.TREASURE_HUNT_REDEMPTION_TOKEN;
  if (!baseUrl || !token) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  try {
    const idempotencyKey = c.req.header('Idempotency-Key');
    const response = await fetch(`${baseUrl}/v1/admin/rewards/redeem`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': c.req.header('Content-Type') ?? 'application/json',
        'X-Organization-Id': c.get('organization').id,
        'X-PEC-Operator-Id': c.get('user').id,
        'X-CRM-Permissions': 'rewards.redeem',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: await c.req.text(),
    });
    const responseBody = await response.text();
    const responseHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!response.ok && response.status >= 400 && response.status < 500) return new Response(responseBody, { status: response.status, headers: responseHeaders });
    if (!response.ok) return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
    return new Response(responseBody, { status: response.status, headers: responseHeaders });
  } catch {
    return c.json({ error: { code: 'TREASURE_HUNT_UNAVAILABLE', message: 'Treasure Hunt no está disponible en este momento.' } }, 503);
  }
}

treasureHuntRoutes.get('/campaigns', readPermission, (c) => forward(c, '/v1/admin/hunts'));
treasureHuntRoutes.get('/campaigns/:id', readPermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}`));
treasureHuntRoutes.post('/campaigns', managePermission, (c) => forward(c, '/v1/admin/hunts', 'POST', 'crm.manage'));
treasureHuntRoutes.get('/campaigns/:id/draft', readPermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft`));
treasureHuntRoutes.put('/campaigns/:id/draft', managePermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft`, 'PUT', 'crm.manage'));
treasureHuntRoutes.post('/campaigns/:id/draft/steps/:stepId/target', managePermission, (c) => forwardTargetUpload(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/steps/${encodeURIComponent(c.req.param('stepId'))}/target`));
treasureHuntRoutes.get('/campaigns/:id/draft/steps/:stepId/target', readPermission, (c) => forwardTargetPreview(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/steps/${encodeURIComponent(c.req.param('stepId'))}/target`));
treasureHuntRoutes.delete('/campaigns/:id/draft/steps/:stepId/target', managePermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/steps/${encodeURIComponent(c.req.param('stepId'))}/target`, 'DELETE', 'crm.manage'));
treasureHuntRoutes.patch('/campaigns/:id/draft/steps/:stepId/target', managePermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/steps/${encodeURIComponent(c.req.param('stepId'))}/target`, 'PATCH', 'crm.manage'));
treasureHuntRoutes.post('/campaigns/:id/draft/compile', managePermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/compile`, 'POST', 'crm.manage'));
treasureHuntRoutes.post('/campaigns/:id/draft/compile/:compilationId/artifact', managePermission, (c) => forwardCompiledArtifact(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/compile/${encodeURIComponent(c.req.param('compilationId'))}/artifact`));
treasureHuntRoutes.get('/campaigns/:id/draft/compile/:compilationId', readPermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/draft/compile/${encodeURIComponent(c.req.param('compilationId'))}`, 'GET', 'crm.read'));
treasureHuntRoutes.post('/campaigns/:id/publish', managePermission, (c) => forward(c, `/v1/admin/hunts/${encodeURIComponent(c.req.param('id'))}/publish`, 'POST', 'crm.manage'));
treasureHuntRoutes.post('/rewards/redeem', redemptionPermission, forwardRedemption);
