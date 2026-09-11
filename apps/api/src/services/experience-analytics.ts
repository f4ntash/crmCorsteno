export type EnsureExperienceAnalyticsApplicationInput = {
  db: D1Database;
  experienceId: string;
  organizationId: string;
  experienceType: string;
  name: string;
};

export async function ensureExperienceAnalyticsApplication({ db, experienceId, organizationId, experienceType, name }: EnsureExperienceAnalyticsApplicationInput) {
  const existing = await db.prepare('SELECT application_id applicationId FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first<{ applicationId: string | null }>();
  if (existing?.applicationId) return existing.applicationId;

  const project = await db.prepare('SELECT id FROM projects WHERE organization_id=? ORDER BY created_at LIMIT 1').bind(organizationId).first<{ id: string }>();
  if (!project) return null;

  const applicationId = crypto.randomUUID();
  const applicationSlug = `${experienceType}-${experienceId}`;
  await db.prepare("INSERT OR IGNORE INTO applications (id, organization_id, project_id, name, slug, status, application_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)")
    .bind(applicationId, organizationId, project.id, name, applicationSlug, experienceType, Date.now(), Date.now()).run();
  const actual = await db.prepare('SELECT id FROM applications WHERE organization_id=? AND project_id=? AND slug=?').bind(organizationId, project.id, applicationSlug).first<{ id: string }>();
  if (!actual) return null;
  await db.prepare('UPDATE experiences SET project_id=?, application_id=? WHERE id=? AND organization_id=?').bind(project.id, actual.id, experienceId, organizationId).run();
  return actual.id;
}
