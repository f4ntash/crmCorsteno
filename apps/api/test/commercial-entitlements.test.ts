import { describe, expect, it } from 'vitest';
import { ALL_COMMERCIAL_FEATURES, COMMERCIAL_PLAN_DEFINITIONS, getCommercialEntitlements } from '@corsteno/types';
import { getExperienceEntitlements, LEGACY_FULL_ACCESS, ROULETTE_BASE_ENTITLEMENTS, parseSubscriptionEntitlements, subscriptionHasFeature } from '../src/services/commercial-entitlements';

function rouletteEntitlementsDb(status: 'active' | 'suspended', end: string, featureEntitlementsJson = '{"features":[],"maxActiveExperiences":1}') {
  return {
    prepare(sql: string) {
      return { bind() { return {
        async first() { return { type: 'roulette', commercialAccessRequired: 1 }; },
        async all() { return { results: sql.includes('FROM subscription_experiences') ? [{ status, startsAt: '2026-09-01T00:00:00.000Z', currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: end, cancelAtPeriodEnd: 0, featureEntitlementsJson }] : [] }; },
      }; } };
    },
  } as unknown as D1Database;
}

describe('commercial plan feature configuration', () => {
  it('keeps the three plans ordered by increasing capability', () => {
    expect(COMMERCIAL_PLAN_DEFINITIONS.starter.features).toEqual(['roulette', 'standard_3d', 'result_cta', 'inventory', 'participation_limits', 'basic_analytics']);
    expect(COMMERCIAL_PLAN_DEFINITIONS.professional.features).toContain('webxr_ar');
    expect(COMMERCIAL_PLAN_DEFINITIONS.enterprise.features).toEqual(COMMERCIAL_PLAN_DEFINITIONS.professional.features);
    expect(COMMERCIAL_PLAN_DEFINITIONS.starter.maxActiveExperiences).toBe(1);
    expect(COMMERCIAL_PLAN_DEFINITIONS.professional.maxActiveExperiences).toBe(3);
    expect(COMMERCIAL_PLAN_DEFINITIONS.enterprise.maxActiveExperiences).toBeNull();
  });

  it('creates a stable snapshot for a known plan', () => {
    expect(getCommercialEntitlements('starter')).toEqual({ features: COMMERCIAL_PLAN_DEFINITIONS.starter.features, maxActiveExperiences: 1 });
    expect(getCommercialEntitlements('unknown')).toBeNull();
  });

  it('treats legacy subscriptions without a snapshot as full access', () => {
    expect(parseSubscriptionEntitlements(null)).toEqual(LEGACY_FULL_ACCESS);
    expect(subscriptionHasFeature(null, 'webxr_ar')).toBe(true);
    expect(parseSubscriptionEntitlements('{"features":["roulette"],"maxActiveExperiences":1}')).toEqual({ features: ['roulette'], maxActiveExperiences: 1 });
  });

  it('fails closed for malformed snapshots without exposing unknown features', () => {
    expect(parseSubscriptionEntitlements('{broken')).toEqual({ features: [], maxActiveExperiences: 0 });
    expect(parseSubscriptionEntitlements(JSON.stringify({ features: ['roulette', 'not-a-feature'], maxActiveExperiences: 1 })).features).toEqual(['roulette']);
    expect(ALL_COMMERCIAL_FEATURES).toHaveLength(11);
  });
  it('includes branding and advanced analytics for Roulette with unlimited experiences', () => {
    expect(ROULETTE_BASE_ENTITLEMENTS.features).toContain('custom_branding');
    expect(ROULETTE_BASE_ENTITLEMENTS.features).toContain('advanced_analytics');
    expect(ROULETTE_BASE_ENTITLEMENTS.features).toContain('redemption_claims');
    expect(ROULETTE_BASE_ENTITLEMENTS.maxActiveExperiences).toBeNull();
  });
  it('grants the base Roulette features only while its subscription is active', async () => {
    const active = await getExperienceEntitlements(rouletteEntitlementsDb('active', '2026-10-31T00:00:00.000Z'), 'exp-a', 'org-a');
    const suspended = await getExperienceEntitlements(rouletteEntitlementsDb('suspended', '2026-10-31T00:00:00.000Z'), 'exp-a', 'org-a');
    expect(active.features).toContain('custom_branding');
    expect(active.features).toContain('advanced_analytics');
    expect(active.maxActiveExperiences).toBe(1);
    expect(suspended.features).toEqual([]);
  });
});
