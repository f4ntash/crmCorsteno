import { ALL_COMMERCIAL_FEATURES, type CommercialEntitlements, type CommercialFeature } from '@corsteno/types';

const legacy: CommercialEntitlements = { features: [...ALL_COMMERCIAL_FEATURES], maxActiveExperiences: null };
export function subscriptionHasFeature(entitlements: CommercialEntitlements | undefined, feature: CommercialFeature) {
  return (entitlements ?? legacy).features.includes(feature);
}
