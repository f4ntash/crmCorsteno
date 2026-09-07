import { Hono } from 'hono';
import { requireAuth, requireOrganization } from '../auth/middleware';
import type { Env } from '../index';
type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};
export const appDataRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();
appDataRoutes.use('*', requireAuth, requireOrganization);
appDataRoutes.get('/dashboard/summary', async (c) => {
  const o = c.get('organization');
  const db = c.env.DB;
  const [p, a, m] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) count FROM projects WHERE organization_id=?')
      .bind(o.id)
      .first<{ count: number }>(),
    db
      .prepare(
        'SELECT COUNT(*) count FROM applications WHERE organization_id=?',
      )
      .bind(o.id)
      .first<{ count: number }>(),
    db
      .prepare(
        'SELECT COUNT(*) count FROM memberships WHERE organization_id=? AND status=?',
      )
      .bind(o.id, 'active')
      .first<{ count: number }>(),
  ]);
  return c.json({
    organization: { id: o.id, name: o.name, slug: o.slug },
    counts: {
      projects: p?.count ?? 0,
      applications: a?.count ?? 0,
      members: m?.count ?? 0,
    },
    status: 'operational',
  });
});
appDataRoutes.get('/projects', async (c) => {
  const r = await c.env.DB.prepare(
    'SELECT id,name,slug,status,description,created_at createdAt,updated_at updatedAt FROM projects WHERE organization_id=? ORDER BY created_at DESC',
  )
    .bind(c.get('organization').id)
    .all();
  return c.json(r.results);
});
appDataRoutes.get('/applications', async (c) => {
  const q = c.req.query();
  const sql = q.projectId
    ? "SELECT id,organization_id organizationId,project_id projectId,name,slug,status,COALESCE(application_type,'generic') applicationType FROM applications WHERE organization_id=? AND project_id=? ORDER BY name"
    : "SELECT id,organization_id organizationId,project_id projectId,name,slug,status,COALESCE(application_type,'generic') applicationType FROM applications WHERE organization_id=? ORDER BY name";
  const args = q.projectId
    ? [c.get('organization').id, q.projectId]
    : [c.get('organization').id];
  const result = await c.env.DB.prepare(sql)
    .bind(...args)
    .all<{
      id: string;
      organizationId: string;
      projectId: string;
      name: string;
      slug: string;
      status: string;
      applicationType: string | null;
    }>();
  return c.json(
    result.results.map((application) => ({
      ...application,
      applicationType: application.applicationType ?? 'generic',
    })),
  );
});
appDataRoutes.get('/projects/:id', async (c) => {
  const o = c.get('organization');
  const p = await c.env.DB.prepare(
    'SELECT id,name,slug,status,description,created_at createdAt,updated_at updatedAt FROM projects WHERE id=? AND organization_id=?',
  )
    .bind(c.req.param('id'), o.id)
    .first();
  if (!p)
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Project not found' } },
      404,
    );
  const apps = await c.env.DB.prepare(
    'SELECT id,name,slug,status FROM applications WHERE project_id=? AND organization_id=?',
  )
    .bind(c.req.param('id'), o.id)
    .all();
  return c.json({ ...p, applications: apps.results });
});
