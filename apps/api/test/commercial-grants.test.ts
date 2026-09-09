import { describe, expect, it } from 'vitest';
import { grantPeriod } from '../src/services/commercial-grants';

const subscription = { id: 's', organizationId: 'o', currentPeriodEnd: '2026-10-01T00:00:00.000Z', billingInterval: 'monthly' as const, billingIntervalCount: 1, includedAccessDays: null, experiences: [{ id: 'e1' }, { id: 'e2' }] };

describe('commercial grant periods', () => {
  it('uses the latest commercial end as the base for a courtesy extension', () => {
    const start = new Date(subscription.currentPeriodEnd);
    expect(grantPeriod(subscription, start, 30).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('uses calendar cadence for a free monthly period and rejects unsafe durations', () => {
    expect(grantPeriod(subscription, new Date('2026-01-31T00:00:00.000Z')).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(() => grantPeriod(subscription, new Date('2026-01-01T00:00:00.000Z'), 0)).toThrow();
  });
});
