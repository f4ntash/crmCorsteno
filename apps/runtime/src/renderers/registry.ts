import { createElement, type ReactNode } from 'react';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import type { CommercialEntitlements } from '@corsteno/types';
import { LazyRoulette3DView } from '../features/roulette3d/LazyRoulette3DView';
import { resolveRuntimeConfig } from '../config/runtimeConfig';
import type { SpinResult } from '../api/publicExperiencesApi';
import type { CatalogPublicProduct } from '../api/publicExperiencesApi';
import { ProductCatalogView } from '../features/catalog/ProductCatalogView';

export type RuntimeExperienceRenderInput = {
  type: string;
  config: unknown;
  slug: string;
  entitlements: CommercialEntitlements;
  prizeAvailability?: Record<string, 'available' | 'sold_out'>;
  recovery?: SpinResult;
  catalogProducts?: CatalogPublicProduct[];
};

export type RuntimeRenderer = {
  type: string;
  render: (input: RuntimeExperienceRenderInput) => ReactNode;
};

const rouletteRuntimeRenderer: RuntimeRenderer = {
  type: 'roulette',
  render: ({ config, slug, entitlements, prizeAvailability, recovery }) => createElement(LazyRoulette3DView, {
    config: resolveRuntimeConfig(config as Roulette3DConfig, entitlements),
    slug,
    entitlements,
    prizeAvailability,
    initialResult: recovery,
  }),
};

const productCatalogRuntimeRenderer: RuntimeRenderer = {
  type: 'product-catalog',
  render: ({ config, slug, catalogProducts }) => createElement(ProductCatalogView, { config, slug, products: catalogProducts ?? [] }),
};

export const runtimeRendererRegistry: ReadonlyMap<string, RuntimeRenderer> = new Map([
  [rouletteRuntimeRenderer.type, rouletteRuntimeRenderer],
  [productCatalogRuntimeRenderer.type, productCatalogRuntimeRenderer],
]);

export function resolveRuntimeRenderer(type: unknown, registry: ReadonlyMap<string, RuntimeRenderer> = runtimeRendererRegistry) {
  return typeof type === 'string' ? registry.get(type) ?? null : null;
}
