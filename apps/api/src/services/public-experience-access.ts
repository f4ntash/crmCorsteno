import { getEffectiveExperienceAccessStatus, getExperienceAccessPeriods } from './experience-access';
import { getEffectiveSubscriptionStatus } from './subscription-periods';

export async function hasCommercialAccess(db: D1Database, experienceId: string, organizationId: string) {
  const subscriptions = await db.prepare(`SELECT s.status,s.starts_at startsAt,s.current_period_start currentPeriodStart,s.current_period_end currentPeriodEnd,s.cancel_at_period_end cancelAtPeriodEnd
    FROM subscription_experiences se JOIN subscriptions s ON s.id=se.subscription_id
    WHERE se.experience_id=? AND se.organization_id=? AND s.organization_id=?`).bind(experienceId, organizationId, organizationId).all<{
      status: 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
      startsAt: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
      cancelAtPeriodEnd: number;
    }>();
  if (subscriptions.results.length) {
    return subscriptions.results.some((subscription) => getEffectiveSubscriptionStatus(subscription.status, subscription.startsAt, subscription.currentPeriodStart, subscription.currentPeriodEnd, subscription.cancelAtPeriodEnd) === 'active');
  }
  const experience = await db.prepare('SELECT commercial_access_required commercialAccessRequired FROM experiences WHERE id=? AND organization_id=?').bind(experienceId, organizationId).first<{ commercialAccessRequired: number }>();
  const periods = await getExperienceAccessPeriods(db, experienceId, organizationId);
  return getEffectiveExperienceAccessStatus(periods, Date.now(), Number(experience?.commercialAccessRequired) === 1) === 'active' || (!Number(experience?.commercialAccessRequired) && !periods.length);
}
