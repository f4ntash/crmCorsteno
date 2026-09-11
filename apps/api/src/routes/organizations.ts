import { Hono } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import { hashPassword } from '../auth/crypto';
import type { Env } from '../index';

export const organizationRoutes = new Hono<{ Bindings: Env }>();
const platformAdmins = ['corsteno_admin', 'super_admin'];
const roles = ['owner', 'admin', 'member', 'viewer'] as const;
function isPlatformAdmin(role: string) { return platformAdmins.includes(role); }
function isRole(value: unknown): value is typeof roles[number] { return typeof value === 'string' && roles.includes(value as typeof roles[number]); }

organizationRoutes.get('/current', requireAuth, requireOrganization, c => c.json(c.get('organization')));

organizationRoutes.get('/members', requireAuth, requireOrganization, requireOrganizationPermission('organization.read'), async c => {
  const organization = c.get('organization');
  const rows = await c.env.DB.prepare('SELECT u.id,u.name,u.email,u.status userStatus,m.role,m.status,m.created_at createdAt FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY CASE WHEN m.status=? THEN 0 ELSE 1 END,u.name,u.email').bind(organization.id, 'active').all();
  return c.json({ items: rows.results });
});

organizationRoutes.post('/members', requireAuth, requireOrganization, requireOrganizationPermission('organization.manage'), async c => {
  const organization = c.get('organization');
  const actor = c.get('user');
  const body = await c.req.json<{ email?: unknown; name?: unknown; password?: unknown; role?: unknown }>().catch(() => ({} as { email?: unknown; name?: unknown; password?: unknown; role?: unknown }));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'admin' || body.role === 'viewer' ? body.role : 'member';
  if (!/^\S+@\S+\.\S+$/.test(email) || name.length > 120 || (name && name.length < 2) || (password && (password.length < 8 || password.length > 200))) return c.json({ error: { code: 'BAD_REQUEST', message: 'Email válido, nombre opcional y contraseña de 8 a 200 caracteres para cuentas nuevas' } }, 400);
  if (role === 'admin' && organization.role !== 'owner' && !isPlatformAdmin(actor.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el propietario puede asignar administradores' } }, 403);
  const existing = await c.env.DB.prepare('SELECT id,name,email,status,password_hash passwordHash,platform_role platformRole FROM users WHERE email_normalized=?').bind(email).first<{ id: string; name: string; email: string; status: string; passwordHash: string; platformRole: string }>();
  if (existing && !password && !existing.passwordHash) return c.json({ error: { code: 'BAD_REQUEST', message: 'La cuenta necesita una contraseña inicial' } }, 400);
  if (!existing && !password) return c.json({ error: { code: 'BAD_REQUEST', message: 'La cuenta nueva necesita una contraseña inicial' } }, 400);
  const member = existing ? await c.env.DB.prepare('SELECT status FROM memberships WHERE user_id=? AND organization_id=?').bind(existing.id, organization.id).first<{ status: string }>() : null;
  if (member?.status === 'active') return c.json({ error: { code: 'CONFLICT', message: 'Esta persona ya es miembro de la organización' } }, 409);
  const userId = existing?.id ?? crypto.randomUUID(); const now = Date.now();
  const statements = [] as D1PreparedStatement[];
  if (existing) {
    statements.push(c.env.DB.prepare('UPDATE users SET name=?,status=?,updated_at=? WHERE id=?').bind(name || existing.name, 'active', now, userId));
  } else statements.push(c.env.DB.prepare("INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (?,?,?,?,'active',?,'user',?,?)").bind(userId, email, email, name || email, await hashPassword(password), now, now));
  statements.push(c.env.DB.prepare("INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?) ON CONFLICT(user_id,organization_id) DO UPDATE SET role=excluded.role,status='active',updated_at=excluded.updated_at").bind(crypto.randomUUID(), userId, organization.id, role, now, now));
  await c.env.DB.batch(statements);
  return c.json({ id: userId, email: existing?.email ?? email, name: name || existing?.name || email, role, status: 'active' }, 201);
});

organizationRoutes.patch('/members/:userId', requireAuth, requireOrganization, requireOrganizationPermission('organization.manage'), async c => {
  const organization = c.get('organization'); const actor = c.get('user'); const userId = c.req.param('userId');
  const body = await c.req.json<{ role?: unknown }>().catch(() => ({} as { role?: unknown }));
  if (!isRole(body.role) || body.role === 'owner' && organization.role !== 'owner' && !isPlatformAdmin(actor.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Rol no autorizado' } }, 403);
  const target = await c.env.DB.prepare('SELECT m.role,m.status FROM memberships m WHERE m.user_id=? AND m.organization_id=?').bind(userId, organization.id).first<{ role: string; status: string }>();
  if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } }, 404);
  if (target.role === 'owner' && organization.role !== 'owner' && !isPlatformAdmin(actor.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'No puedes modificar al propietario' } }, 403);
  if ((target.role === 'owner' || target.role === 'admin') && body.role !== 'owner' && body.role !== 'admin') {
    const count = await c.env.DB.prepare("SELECT COUNT(*) count FROM memberships WHERE organization_id=? AND status=? AND role IN ('owner','admin')").bind(organization.id, 'active').first<{ count: number }>();
    if (Number(count?.count ?? 0) <= 1) return c.json({ error: { code: 'LAST_ADMIN', message: 'La organización debe conservar al menos un administrador' } }, 409);
  }
  await c.env.DB.prepare('UPDATE memberships SET role=?,updated_at=? WHERE user_id=? AND organization_id=?').bind(body.role, Date.now(), userId, organization.id).run();
  return c.json({ userId, role: body.role });
});

organizationRoutes.delete('/members/:userId', requireAuth, requireOrganization, requireOrganizationPermission('organization.manage'), async c => {
  const organization = c.get('organization'); const actor = c.get('user'); const userId = c.req.param('userId');
  if (userId === actor.id) return c.json({ error: { code: 'FORBIDDEN', message: 'No puedes revocar tu propio acceso' } }, 403);
  const target = await c.env.DB.prepare('SELECT role,status FROM memberships WHERE user_id=? AND organization_id=?').bind(userId, organization.id).first<{ role: string; status: string }>();
  if (!target) return c.json({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } }, 404);
  if ((target.role === 'owner' || target.role === 'admin') && target.status === 'active') {
    const count = await c.env.DB.prepare("SELECT COUNT(*) count FROM memberships WHERE organization_id=? AND status=? AND role IN ('owner','admin')").bind(organization.id, 'active').first<{ count: number }>();
    if (Number(count?.count ?? 0) <= 1) return c.json({ error: { code: 'LAST_ADMIN', message: 'La organización debe conservar al menos un administrador' } }, 409);
  }
  await c.env.DB.prepare('UPDATE memberships SET status=?,updated_at=? WHERE user_id=? AND organization_id=?').bind('inactive', Date.now(), userId, organization.id).run();
  return c.json({ userId, status: 'inactive' });
});
