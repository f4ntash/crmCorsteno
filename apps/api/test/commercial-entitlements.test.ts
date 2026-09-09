import { describe, expect, it } from 'vitest';
import { ALL_COMMERCIAL_FEATURES, COMMERCIAL_PLAN_DEFINITIONS, getCommercialEntitlements } from '@corsteno/types';
import { LEGACY_FULL_ACCESS, parseSubscriptionEntitlements, subscriptionHasFeature } from '../src/services/commercial-entitlements';

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
});
