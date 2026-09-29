import { describe, expect, it } from 'vitest';
import { addBillingInterval, getEffectiveSubscriptionStatus } from '../src/services/subscription-periods';

describe('subscription period arithmetic', () => {
  it('adds monthly periods by calendar month and clamps month ends', () => {
    expect(addBillingInterval(new Date('2026-01-31T00:00:00.000Z'), 'monthly', 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
  it('adds yearly and fixed-day periods', () => {
    expect(addBillingInterval(new Date('2026-09-10T00:00:00.000Z'), 'yearly', 1).toISOString()).toBe('2027-09-10T00:00:00.000Z');
    expect(addBillingInterval(new Date('2026-09-10T00:00:00.000Z'), 'one_time', 1, 7).toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });
  it('keeps a future subscription pending until the start of its current period', () => {
    expect(getEffectiveSubscriptionStatus('active', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 0, Date.parse('2026-09-30T23:59:59.999Z'))).toBe('pending');
    expect(getEffectiveSubscriptionStatus('active', '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 0, Date.parse('2026-09-30T23:59:59.999Z'))).toBe('pending');
  });
  it('is active inside its period and expires at the exclusive end boundary', () => {
    expect(getEffectiveSubscriptionStatus('active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z', 0, Date.parse('2026-09-15T12:00:00.000Z'))).toBe('active');
    expect(getEffectiveSubscriptionStatus('active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z', 0, Date.parse('2026-09-30T00:00:00.000Z'))).toBe('expired');
  });
  it('returns suspended or cancelled and treats scheduled cancellation as cancelled after expiry', () => {
    expect(getEffectiveSubscriptionStatus('suspended', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z', 0, Date.parse('2026-09-15T12:00:00.000Z'))).toBe('suspended');
    expect(getEffectiveSubscriptionStatus('cancelled', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z', 0, Date.parse('2026-09-15T12:00:00.000Z'))).toBe('cancelled');
    expect(getEffectiveSubscriptionStatus('active', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z', 1, Date.parse('2026-09-30T00:00:00.000Z'))).toBe('cancelled');
  });
});
