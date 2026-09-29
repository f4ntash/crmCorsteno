export type BillingInterval = 'monthly' | 'yearly' | 'one_time';
export type SubscriptionStatus = 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
export type EffectiveSubscriptionStatus = Exclude<SubscriptionStatus, 'pending'> | 'pending';

export function addBillingInterval(value: Date, interval: BillingInterval, count: number, includedAccessDays?: number | null) {
  const result = new Date(value.getTime());
  if (interval === 'one_time') {
    if (!includedAccessDays || includedAccessDays < 1) throw new Error('one_time plans require included_access_days');
    result.setUTCDate(result.getUTCDate() + includedAccessDays);
    return result;
  }
  const originalDay = result.getUTCDate();
  const targetMonth = result.getUTCMonth() + (interval === 'monthly' ? count : count * 12);
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function getEffectiveSubscriptionStatus(
  status: SubscriptionStatus,
  startsAt: string,
  currentPeriodStart: string,
  currentPeriodEnd: string,
  cancelAtPeriodEnd = 0,
  now = Date.now(),
): EffectiveSubscriptionStatus {
  if (status === 'suspended') return 'suspended';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired') return 'expired';
  if (now < Math.max(new Date(startsAt).getTime(), new Date(currentPeriodStart).getTime())) return 'pending';
  if (now >= new Date(currentPeriodEnd).getTime()) return cancelAtPeriodEnd ? 'cancelled' : 'expired';
  return 'active';
}
