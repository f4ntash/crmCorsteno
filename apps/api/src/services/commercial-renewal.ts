import { addBillingInterval } from './subscription-periods';

export type RenewalSubscription = {
  id: string;
  organizationId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  billingInterval: 'monthly' | 'yearly' | 'one_time';
  billingIntervalCount: number;
  includedAccessDays: number | null;
  cancelAtPeriodEnd: number;
  status: 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
  experiences: Array<{ id: string }>;
};

export async function renewSubscription(db: D1Database, subscription: RenewalSubscription, actorId: string, idempotencyKey: string, commercialPaymentId?: string, now = Date.now(), prefixStatements: D1PreparedStatement[] = []) {
  const existing = await db.prepare('SELECT id FROM subscription_periods WHERE subscription_id=? AND organization_id=? AND idempotency_key=?').bind(subscription.id, subscription.organizationId, idempotencyKey).first<{ id: string }>();
  if (existing) return false;
  const currentEnd = new Date(subscription.currentPeriodEnd);
  const startsAt = currentEnd.getTime() < now ? new Date(now) : currentEnd;
  const endsAt = addBillingInterval(startsAt, subscription.billingInterval, subscription.billingIntervalCount, subscription.includedAccessDays);
  const currentPeriodStart = currentEnd.getTime() < now ? startsAt : new Date(subscription.currentPeriodStart);
  const nextStatus = subscription.status === 'suspended' ? 'suspended' : 'active';
  const periodId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT OR IGNORE INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status,idempotency_key,commercial_payment_id) VALUES (?,?,?,?,?,?,?,?)').bind(periodId, subscription.id, subscription.organizationId, startsAt.toISOString(), endsAt.toISOString(), 'active', idempotencyKey, commercialPaymentId ?? null),
    db.prepare('UPDATE subscriptions SET status=?,current_period_start=?,current_period_end=?,cancel_at_period_end=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?').bind(nextStatus, currentPeriodStart.toISOString(), endsAt.toISOString(), subscription.id, subscription.organizationId),
  ];
  for (const experience of subscription.experiences) statements.push(db.prepare('INSERT OR IGNORE INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,subscription_period_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), experience.id, subscription.organizationId, startsAt.toISOString(), endsAt.toISOString(), 'subscription', actorId, `Subscription ${subscription.id}`, periodId));
  await db.batch([...prefixStatements, ...statements]);
  return true;
}
