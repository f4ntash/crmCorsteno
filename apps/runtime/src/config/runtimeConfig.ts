import type { CommercialEntitlements } from '@corsteno/types';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';

export function resolveRuntimeConfig(config: Roulette3DConfig, entitlements: CommercialEntitlements) {
  if (entitlements.features.includes('custom_branding')) return config;
  const base = { ...config };
  delete base.branding;
  delete base.content;
  return base;
}
