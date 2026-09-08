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
  subscriptionPeriodId?: string | null;
  planName?: string | null;
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
      `SELECT ap.id, ap.experience_id experienceId, ap.organization_id organizationId, ap.starts_at startsAt, ap.ends_at endsAt, ap.source, ap.created_at createdAt, ap.created_by createdBy, ap.note, ap.subscription_period_id subscriptionPeriodId, p.name planName
    FROM experience_access_periods ap LEFT JOIN subscription_periods sp ON sp.id=ap.subscription_period_id LEFT JOIN subscriptions s ON s.id=sp.subscription_id LEFT JOIN plans p ON p.id=s.plan_id
    WHERE ap.experience_id=? AND ap.organization_id=? ORDER BY ap.starts_at ASC, ap.created_at ASC, ap.id ASC`,
    )
    .bind(experienceId, organizationId)
    .all<ExperienceAccessPeriod>();
  return rows.results;
}
