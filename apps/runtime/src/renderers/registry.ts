import { createElement, type ReactNode } from 'react';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import type { CommercialEntitlements } from '@corsteno/types';
import { Roulette3DView } from '../features/roulette3d/Roulette3DView';
import { resolveRuntimeConfig } from '../config/runtimeConfig';
import type { SpinResult } from '../api/publicExperiencesApi';

export type RuntimeExperienceRenderInput = {
  type: string;
  config: unknown;
  slug: string;
  entitlements: CommercialEntitlements;
  prizeAvailability?: Record<string, 'available' | 'sold_out'>;
  recovery?: SpinResult;
};

export type RuntimeRenderer = {
  type: string;
  render: (input: RuntimeExperienceRenderInput) => ReactNode;
};

const rouletteRuntimeRenderer: RuntimeRenderer = {
  type: 'roulette',
  render: ({ config, slug, entitlements, prizeAvailability, recovery }) => createElement(Roulette3DView, {
    config: resolveRuntimeConfig(config as Roulette3DConfig, entitlements),
    slug,
    entitlements,
    prizeAvailability,
    initialResult: recovery,
  }),
};

export const runtimeRendererRegistry: ReadonlyMap<string, RuntimeRenderer> = new Map([
  [rouletteRuntimeRenderer.type, rouletteRuntimeRenderer],
]);

export function resolveRuntimeRenderer(type: unknown, registry: ReadonlyMap<string, RuntimeRenderer> = runtimeRendererRegistry) {
  return typeof type === 'string' ? registry.get(type) ?? null : null;
}
