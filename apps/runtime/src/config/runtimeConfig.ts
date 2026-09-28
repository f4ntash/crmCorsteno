import type { Roulette3DConfig } from '@corsteno/roulette-3d';

export function resolveRuntimeConfig(config: Roulette3DConfig) {
  // Existing Roulette configs include these fields regardless of commercial
  // plan. Preserve them in preview and public runtime for older campaigns too.
  return config;
}
