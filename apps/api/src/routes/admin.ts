import { Hono } from 'hono'; import { requireAuth } from '../auth/middleware'; import type { Env } from '../index';
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
adminRoutes.get('/organizations/:id', requireAuth, async c => { const u=c.get('user'); if(!['corsteno_admin','super_admin'].includes(u.platformRole)) return c.json({error:{code:'FORBIDDEN',message:'Access denied'}},403); const id=c.req.param('id'); const o=await c.env.DB.prepare('SELECT id,name,slug,status,created_at createdAt FROM organizations WHERE id=?').bind(id).first(); if(!o)return c.notFound(); const projects=await c.env.DB.prepare('SELECT id,name,slug,status FROM projects WHERE organization_id=?').bind(id).all(); const counts=await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM projects WHERE organization_id=?) projects,(SELECT COUNT(*) FROM memberships WHERE organization_id=? AND status=?) members').bind(id,id,'active').first(); return c.json({...o,...counts,projects:projects.results}); });
