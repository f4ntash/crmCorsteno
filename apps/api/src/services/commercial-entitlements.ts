import { ALL_COMMERCIAL_FEATURES, getCommercialEntitlements, type CommercialEntitlements, type CommercialFeature } from '@corsteno/types';

export const LEGACY_FULL_ACCESS: CommercialEntitlements = {
  features: [...ALL_COMMERCIAL_FEATURES],
  maxActiveExperiences: null,
};
const NO_ACCESS: CommercialEntitlements = { features: [], maxActiveExperiences: 0 };

export function parseSubscriptionEntitlements(value: unknown): CommercialEntitlements {
  if (value === null || value === undefined || value === '') return { ...LEGACY_FULL_ACCESS, features: [...LEGACY_FULL_ACCESS.features] };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { features?: unknown }).features)) return NO_ACCESS;
    const features = (parsed as { features: unknown[] }).features.filter((feature): feature is CommercialFeature => typeof feature === 'string' && ALL_COMMERCIAL_FEATURES.includes(feature as CommercialFeature));
    const max = (parsed as { maxActiveExperiences?: unknown }).maxActiveExperiences;
    if (max !== null && max !== undefined && (!Number.isSafeInteger(Number(max)) || Number(max) < 0)) return NO_ACCESS;
    return { features, maxActiveExperiences: max === null || max === undefined ? null : Number(max) };
  } catch { return NO_ACCESS; }
}

export function subscriptionHasFeature(value: unknown, feature: CommercialFeature) {
  return parseSubscriptionEntitlements(value).features.includes(feature);
}

export function entitlementsForPlan(planCode: string) {
  return getCommercialEntitlements(planCode);
}

export async function getExperienceEntitlements(db: D1Database, experienceId: string, organizationId: string): Promise<CommercialEntitlements> {
  try {
    const rows = await db.prepare("SELECT s.feature_entitlements_json featureEntitlementsJson FROM subscription_experiences se JOIN subscriptions s ON s.id=se.subscription_id WHERE se.experience_id=? AND se.organization_id=? AND s.organization_id=? AND s.status IN ('active','pending')").bind(experienceId, organizationId, organizationId).all<{ featureEntitlementsJson: string | null }>();
    if (!rows.results.length || rows.results.some((row) => row.featureEntitlementsJson === null)) return { ...LEGACY_FULL_ACCESS, features: [...LEGACY_FULL_ACCESS.features] };
    const featureSet = new Set<CommercialFeature>();
    let maxActiveExperiences: number | null = 0;
    for (const row of rows.results) {
      const entitlements = parseSubscriptionEntitlements(row.featureEntitlementsJson);
      entitlements.features.forEach((feature) => featureSet.add(feature));
      if (entitlements.maxActiveExperiences === null) maxActiveExperiences = null;
      else if (maxActiveExperiences !== null) maxActiveExperiences = Math.max(maxActiveExperiences, entitlements.maxActiveExperiences);
    }
    return { features: [...featureSet], maxActiveExperiences };
  } catch { return { ...LEGACY_FULL_ACCESS, features: [...LEGACY_FULL_ACCESS.features] }; }
}
