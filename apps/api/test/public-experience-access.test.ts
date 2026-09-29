import { describe, expect, it } from 'vitest';
import { hasCommercialAccess } from '../src/services/public-experience-access';

type Subscription = {
  status: 'pending' | 'active' | 'suspended' | 'cancelled' | 'expired';
  startsAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: number;
};

function fixture(subscriptionRows: Subscription[] = [], commercialAccessRequired = 1) {
  const state = { subscriptionRows, commercialAccessRequired, periods: [] as Array<{ startsAt: string; endsAt: string; subscriptionStatus?: string }> };
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('FROM subscription_experiences')) return { results: state.subscriptionRows };
              return { results: state.periods };
            },
            async first() {
              return { commercialAccessRequired: state.commercialAccessRequired };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { DB: db, state };
}

describe('runtime commercial access', () => {
  it('denies future subscriptions and allows active subscriptions', async () => {
    const env = fixture();
    const base = { startsAt: '2026-09-01T00:00:00.000Z', currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: '2026-10-01T00:00:00.000Z', cancelAtPeriodEnd: 0 };
    env.state.subscriptionRows = [{ ...base, startsAt: '2026-10-01T00:00:00.000Z', currentPeriodStart: '2026-10-01T00:00:00.000Z', status: 'active' }];
    expect(await hasCommercialAccess(env.DB, 'exp-a', 'org-a')).toBe(false);
    env.state.subscriptionRows = [{ ...base, status: 'active' }];
    expect(await hasCommercialAccess(env.DB, 'exp-a', 'org-a')).toBe(true);
  });

  it('denies expired or suspended subscriptions and restores access after reactivation or renewal', async () => {
    const env = fixture();
    const base = { startsAt: '2026-09-01T00:00:00.000Z', currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: '2026-09-15T00:00:00.000Z', cancelAtPeriodEnd: 0 };
    env.state.subscriptionRows = [{ ...base, status: 'active' }];
    expect(await hasCommercialAccess(env.DB, 'exp-a', 'org-a')).toBe(false);
    env.state.subscriptionRows = [{ ...base, currentPeriodEnd: '2026-10-15T00:00:00.000Z', status: 'suspended' }];
    expect(await hasCommercialAccess(env.DB, 'exp-a', 'org-a')).toBe(false);
    env.state.subscriptionRows = [{ ...base, currentPeriodEnd: '2026-10-15T00:00:00.000Z', status: 'active' }];
    expect(await hasCommercialAccess(env.DB, 'exp-a', 'org-a')).toBe(true);
  });

  it('keeps legacy unrestricted access while blocking a new Roulette without a commercial period', async () => {
    const env = fixture([], 0);
    expect(await hasCommercialAccess(env.DB, 'legacy-exp', 'org-a')).toBe(true);
    env.state.commercialAccessRequired = 1;
    expect(await hasCommercialAccess(env.DB, 'new-exp', 'org-a')).toBe(false);
  });
});
