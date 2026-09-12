import type { D1Database } from '@cloudflare/workers-types';

export type HostedChannel = { id: string; status: 'active' | 'inactive' };

/**
 * Hosted delivery is an explicit channel association. Keeping this lookup in
 * one service makes the public routes and CRM use the same delivery rule.
 */
export async function getHostedChannelForExperience(
  db: D1Database,
  experienceId: string,
  organizationId: string,
): Promise<HostedChannel | null> {
  return db.prepare(
    `SELECT c.id,c.status
       FROM experience_channels ec
       JOIN channels c ON c.id=ec.channel_id AND c.organization_id=ec.organization_id
      WHERE ec.experience_id=? AND ec.organization_id=? AND c.type='hosted_runtime'
      ORDER BY c.id
      LIMIT 1`,
  ).bind(experienceId, organizationId).first<HostedChannel>();
}

export async function hasActiveHostedChannel(
  db: D1Database,
  experienceId: string,
  organizationId: string,
) {
  const channel = await getHostedChannelForExperience(db, experienceId, organizationId);
  return channel?.status === 'active';
}

export async function getOrganizationHostedChannel(db: D1Database, organizationId: string) {
  return db.prepare(
    `SELECT id,status
       FROM channels
      WHERE organization_id=? AND type='hosted_runtime'
      ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id
      LIMIT 1`,
  ).bind(organizationId).first<HostedChannel>();
}

/** Reuse the migration-created channel, or provision one for a new organization. */
export async function ensureOrganizationHostedChannel(db: D1Database, organizationId: string) {
  const existing = await getOrganizationHostedChannel(db, organizationId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.prepare(
      `INSERT INTO channels (id,organization_id,name,type,status,url,created_at,updated_at)
       VALUES (?,?,?,'hosted_runtime','active',NULL,?,?)`,
    ).bind(id, organizationId, 'Corsteno Hosted', now, now).run();
  } catch (error) {
    const concurrent = await getOrganizationHostedChannel(db, organizationId);
    if (concurrent) return concurrent;
    throw error;
  }
  return { id, status: 'active' as const };
}
