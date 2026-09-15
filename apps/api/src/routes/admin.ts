import { Hono } from 'hono'; import { requireAuth } from '../auth/middleware'; import { hashPassword } from '../auth/crypto'; import type { Env } from '../index';
export const adminRoutes = new Hono<{ Bindings: Env }>();
function isPlatformAdmin(role: string) { return ['corsteno_admin', 'super_admin'].includes(role); }
function slugify(value: string) { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'cliente'; }
adminRoutes.get('/organizations', requireAuth, async c => { const u=c.get('user'); if(!isPlatformAdmin(u.platformRole)) return c.json({error:{code:'FORBIDDEN',message:'Access denied'}},403); const r=await c.env.DB.prepare('SELECT o.id,o.name,o.slug,o.status,o.created_at createdAt,(SELECT COUNT(*) FROM projects p WHERE p.organization_id=o.id) projects,(SELECT COUNT(*) FROM memberships m WHERE m.organization_id=o.id AND m.status=?) members FROM organizations o ORDER BY o.created_at DESC').bind('active').all(); return c.json(r.results); });
adminRoutes.post('/organizations', requireAuth, async c => {
  const u = c.get('user');
  if (!isPlatformAdmin(u.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
  const body = await c.req.json<{ name?: unknown }>().catch(() => ({} as { name?: unknown }));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) return c.json({ error: { code: 'BAD_REQUEST', message: 'Organization name must contain 2 to 120 characters' } }, 400);
  const id = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const base = slugify(name);
  const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (?,?,?,\'active\',?,?)').bind(id, name, slug, now, now),
    c.env.DB.prepare('INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (?,?,?,\'activation\',\'active\',?,?,?)').bind(projectId, id, `${name} · Activación`, 'Proyecto inicial creado desde onboarding', now, now),
  ]);
  return c.json({ id, name, slug, projectId }, 201);
});
adminRoutes.post('/onboarding/email-check', requireAuth, async c => {
  const u = c.get('user');
  if (!isPlatformAdmin(u.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
  const body = await c.req.json<{ email?: unknown }>().catch(() => ({} as { email?: unknown }));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Ingresá un email válido.' } }, 400);
  if (await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized=?').bind(email).first()) {
    return c.json({ error: { code: 'EMAIL_EXISTS', message: 'Ya existe una cuenta con ese email.' } }, 409);
  }
  return c.json({ available: true });
});
adminRoutes.post('/onboarding', requireAuth, async c => {
  const u = c.get('user');
  if (!isPlatformAdmin(u.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
  const body = await c.req.json<{ organizationName?: unknown; email?: unknown; name?: unknown; password?: unknown }>().catch(() => ({} as { organizationName?: unknown; email?: unknown; name?: unknown; password?: unknown }));
  const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (organizationName.length < 2 || organizationName.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || name.length > 120 || password.length < 8 || password.length > 200) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Organization, valid email, name and password of 8 to 200 characters are required' } }, 400);
  }
  if (await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized=?').bind(email).first()) {
    return c.json({ error: { code: 'EMAIL_EXISTS', message: 'Ya existe una cuenta con ese email.' } }, 409);
  }
  const id = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = Date.now();
  const slug = `${slugify(organizationName)}-${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = await hashPassword(password);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)").bind(id, organizationName, slug, now, now),
      c.env.DB.prepare("INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (?,?,?,?,'active',?,?,?)").bind(projectId, id, `${organizationName} · Activación`, 'activation', 'Proyecto inicial creado desde onboarding', now, now),
      c.env.DB.prepare("INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (?,?,?,?,'active',?,'user',?,?)").bind(userId, email, email, name, passwordHash, now, now),
      c.env.DB.prepare("INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (?,?,?,'admin','active',?,?)").bind(membershipId, userId, id, now, now),
    ]);
  } catch {
    // The unique normalized-email index is the final guard for concurrent submissions.
    if (await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized=?').bind(email).first()) {
      return c.json({ error: { code: 'EMAIL_EXISTS', message: 'Ya existe una cuenta con ese email.' } }, 409);
    }
    throw new Error('Onboarding provisioning failed');
  }
  return c.json({ id, name: organizationName, slug, projectId, owner: { id: userId, name, email } }, 201);
});
adminRoutes.post('/users', requireAuth, async c => {
  const u = c.get('user');
  if (!isPlatformAdmin(u.platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
  const body = await c.req.json<{ organizationId?: unknown; email?: unknown; name?: unknown; password?: unknown; role?: unknown }>().catch(() => ({} as { organizationId?: unknown; email?: unknown; name?: unknown; password?: unknown; role?: unknown }));
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role === 'member' ? 'member' : 'admin';
  if (!organizationId || !/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || name.length > 120 || password.length < 8 || password.length > 200) return c.json({ error: { code: 'BAD_REQUEST', message: 'organizationId, valid email, name and password of 8 to 200 characters are required' } }, 400);
  if (!await c.env.DB.prepare('SELECT id FROM organizations WHERE id=? AND status=?').bind(organizationId, 'active').first()) return c.json({ error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404);
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email_normalized=?').bind(email).first<{ id: string }>();
  if (existing) return c.json({ error: { code: 'EMAIL_EXISTS', message: 'Ya existe una cuenta con ese email.' } }, 409);
  const userId = crypto.randomUUID(); const now = Date.now(); const passwordHash = await hashPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (?,?,?,?,'active',?,'user',?,?)").bind(userId, email, email, name, passwordHash, now, now),
    c.env.DB.prepare("INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (?,?,?,?,'active',?,?) ON CONFLICT(user_id,organization_id) DO UPDATE SET role=excluded.role,status='active',updated_at=excluded.updated_at").bind(crypto.randomUUID(), userId, organizationId, role, now, now),
  ]);
  return c.json({ id: userId, email, name, organizationId, role }, 201);
});
adminRoutes.get('/organizations/:id', requireAuth, async c => { const u=c.get('user'); if(!['corsteno_admin','super_admin'].includes(u.platformRole)) return c.json({error:{code:'FORBIDDEN',message:'Access denied'}},403); const id=c.req.param('id'); const o=await c.env.DB.prepare('SELECT id,name,slug,status,created_at createdAt FROM organizations WHERE id=?').bind(id).first(); if(!o)return c.notFound(); const projects=await c.env.DB.prepare('SELECT id,name,slug,status FROM projects WHERE organization_id=?').bind(id).all(); const counts=await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM projects WHERE organization_id=?) projects,(SELECT COUNT(*) FROM memberships WHERE organization_id=? AND status=?) members').bind(id,id,'active').first(); return c.json({...o,...counts,projects:projects.results}); });
