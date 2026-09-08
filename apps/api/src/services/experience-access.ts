export type ExperienceAccessStatus =
  'legacy_unrestricted' | 'scheduled' | 'active' | 'expired' | 'no_access';

export type ExperienceAccessPeriod = {
  id: string;
  experienceId: string;
  organizationId: string;
  startsAt: string;
  endsAt: string;
  source: 'manual' | 'subscription' | 'billing' | 'promotion' | string;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
};

export function getEffectiveExperienceAccessStatus(
  periods: Array<Pick<ExperienceAccessPeriod, 'startsAt' | 'endsAt'>>,
  now = Date.now(),
): ExperienceAccessStatus {
  if (!periods.length) return 'legacy_unrestricted';
  if (
    periods.some(
      (period) =>
        now >= new Date(period.startsAt).getTime() &&
        now < new Date(period.endsAt).getTime(),
    )
  )
    return 'active';
  if (periods.some((period) => now < new Date(period.startsAt).getTime()))
    return 'scheduled';
  return periods.length ? 'expired' : 'no_access';
}

export async function getExperienceAccessPeriods(
  db: D1Database,
  experienceId: string,
  organizationId: string,
) {
  const rows = await db
    .prepare(
      `SELECT id, experience_id experienceId, organization_id organizationId, starts_at startsAt, ends_at endsAt, source, created_at createdAt, created_by createdBy, note
    FROM experience_access_periods WHERE experience_id=? AND organization_id=? ORDER BY starts_at ASC, created_at ASC, id ASC`,
    )
    .bind(experienceId, organizationId)
    .all<ExperienceAccessPeriod>();
  return rows.results;
}
