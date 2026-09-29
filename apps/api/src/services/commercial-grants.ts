import { addBillingInterval } from './subscription-periods';

export type GrantType = 'free' | 'promotion' | 'courtesy' | 'trial' | 'support_extension';
export type GrantSubscription = { id: string; organizationId: string; currentPeriodStart: string; currentPeriodEnd: string; status: 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired'; billingInterval: 'monthly' | 'yearly' | 'one_time'; billingIntervalCount: number; includedAccessDays: number | null; experiences: Array<{ id: string }> };

export function grantPeriod(subscription: GrantSubscription, startsAt: Date, days?: number) {
  if (days !== undefined) { if (!Number.isInteger(days) || days < 1 || days > 3660) throw new Error('Invalid grant duration'); const endsAt = new Date(startsAt); endsAt.setUTCDate(endsAt.getUTCDate() + days); return endsAt; }
  return addBillingInterval(startsAt, subscription.billingInterval, subscription.billingIntervalCount, subscription.includedAccessDays);
}

export async function grantSubscriptionPeriod(db: D1Database, subscription: GrantSubscription, type: GrantType, startsAt: Date, endsAt: Date, note: string, createdBy: string) {
  const grantId = crypto.randomUUID(); const periodId = crypto.randomUUID();
  const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
  const currentPeriodStart = currentPeriodEnd.getTime() < Date.now() ? startsAt : new Date(subscription.currentPeriodStart);
  const status = subscription.status === 'suspended' ? 'suspended' : 'active';
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO commercial_grants (id,organization_id,subscription_id,grant_type,starts_at,ends_at,note,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(grantId, subscription.organizationId, subscription.id, type, startsAt.toISOString(), endsAt.toISOString(), note, createdBy),
    db.prepare('INSERT INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status,idempotency_key) VALUES (?,?,?,?,?,?,?)').bind(periodId, subscription.id, subscription.organizationId, startsAt.toISOString(), endsAt.toISOString(), 'active', `grant:${grantId}`),
    db.prepare('UPDATE subscriptions SET status=?,current_period_start=?,current_period_end=CASE WHEN current_period_end>? THEN current_period_end ELSE ? END,cancel_at_period_end=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?').bind(status, currentPeriodStart.toISOString(), endsAt.toISOString(), endsAt.toISOString(), subscription.id, subscription.organizationId),
  ];
  for (const experience of subscription.experiences) statements.push(db.prepare('INSERT INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,subscription_period_id,commercial_grant_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), experience.id, subscription.organizationId, startsAt.toISOString(), endsAt.toISOString(), 'promotion', createdBy, note, periodId, grantId));
  await db.batch(statements); return grantId;
}
