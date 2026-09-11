import { apiRequest } from '../../shared/api/client';
import type { Experience } from './types';
export type ExperienceSpin = {
  id: string;
  experienceId: string;
  segmentId: string | null;
  segmentIndex: number;
  prizeId: string | null;
  outcomeType: 'prize' | 'no_prize';
  createdAt: string;
};
export type PrizeClaim = {
  id: string;
  code: string;
  prizeId: string;
  prizeName: string;
  status: 'active' | 'redeemed';
  createdAt: string;
  redeemedAt: string | null;
};
export type CatalogProduct = {
  id: string;
  organizationId: string;
  experienceId: string;
  name: string;
  description: string;
  priceMinorUnits: number;
  currency: string;
  stock: number;
  visible: boolean;
  mainAssetUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

export const experiencesApi = {
  list: (organizationId: string) =>
    apiRequest<Experience[]>('/experiences', organizationId),
  operationsSummary: (organizationId: string) =>
    apiRequest<{ range: '7d'; items: Array<{ experienceId: string; recentUsers: number; lastActivityAt: number | null; claimsGenerated: number; pendingClaims: number; soldOutLimitedPrizes: number }> }>('/experiences/operations-summary', organizationId),
  get: (id: string, organizationId: string) =>
    apiRequest<Experience & { draftConfig: unknown; publishedConfig: unknown }>(
      `/experiences/${id}`,
      organizationId,
    ),
  create: (organizationId: string, body: unknown) =>
    apiRequest('/experiences', organizationId, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  clone: (id: string, organizationId: string) =>
    apiRequest<Experience>(`/experiences/${id}/clone`, organizationId, {
      method: 'POST',
    }),
  accessPeriods: (id: string, organizationId: string) =>
    apiRequest<{ items: Array<{ id: string; startsAt: string; endsAt: string; source: string; note: string | null; planName?: string | null }>; status: 'legacy_unrestricted' | 'scheduled' | 'active' | 'expired' | 'no_access' }>(`/experiences/${id}/access-periods`, organizationId),
  createAccessPeriod: (id: string, organizationId: string, body: unknown) =>
    apiRequest(`/experiences/${id}/access-periods`, organizationId, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, organizationId: string, body: unknown) =>
    apiRequest(`/experiences/${id}`, organizationId, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publish: (id: string, organizationId: string) =>
    apiRequest(`/experiences/${id}/publish`, organizationId, {
      method: 'POST',
    }),
  uploadAsset: (id: string, organizationId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiRequest(`/experiences/${id}/assets`, organizationId, {
      method: 'POST',
      body,
    });
  },
  inventory: (id: string, organizationId: string) =>
    apiRequest<{
      items: Array<{
        prizeId: string;
        name: string;
        iconUrl: string | null;
        enabled: boolean;
        weight: number;
        stockMode: 'limited' | 'unlimited';
        stockAvailable: number | null;
        deliveredCount: number;
      }>;
    }>(`/experiences/${id}/inventory`, organizationId),
  adjustInventory: (
    id: string,
    organizationId: string,
    prizeId: string,
    delta: number,
  ) =>
    apiRequest<{
      item: {
        prizeId: string;
        stockAvailable: number | null;
        deliveredCount: number;
      };
    }>(`/experiences/${id}/inventory/${prizeId}/adjust`, organizationId, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }),
  spins: (
    id: string,
    organizationId: string,
    params: {
      limit?: number;
      offset?: number;
      outcome?: string;
      prizeId?: string;
      from?: string;
      to?: string;
    } = {},
  ) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        ([, value]) => value !== undefined && value !== '',
      ) as [string, string][],
    ).toString();
    return apiRequest<{
      items: ExperienceSpin[];
      summary: { completed: number; prizesWon: number; byPrize?: Record<string, number> };
      pagination: { limit: number; offset: number; total: number; nextOffset: number | null };
    }>(`/experiences/${id}/spins${query ? `?${query}` : ''}`, organizationId);
  },
  claims: (id: string, organizationId: string, code?: string) =>
    apiRequest<{
      items: PrizeClaim[];
      summary: { generated: number; redeemed: number; pending: number; byPrize?: Record<string, { generated: number; redeemed: number; pending: number }> };
      pagination: { limit: number; offset: number; total: number; nextOffset: number | null };
    }>(
      `/experiences/${id}/claims${code ? `?code=${encodeURIComponent(code)}` : ''}`,
      organizationId,
    ),
  lookupClaim: (organizationId: string, code: string) =>
    apiRequest<{ experienceId: string; claim: PrizeClaim }>(
      `/experiences/claims/lookup?code=${encodeURIComponent(code)}`,
      organizationId,
    ),
  redeemClaim: (id: string, organizationId: string, claimId: string) =>
    apiRequest<PrizeClaim>(
      `/experiences/${id}/claims/${claimId}/redeem`,
      organizationId,
      { method: 'POST' },
    ),
  redeemByCode: (organizationId: string, code: string) =>
    apiRequest<{ prizeName: string; experienceId: string; status: 'redeemed'; redeemedAt: string }>('/experiences/claims/redeem', organizationId, {
      method: 'POST',
      body: JSON.stringify({ code }),
  }),
  catalogProducts: (id: string, organizationId: string) => apiRequest<{ items: CatalogProduct[]; hasUnpublishedChanges: boolean }>(`/experiences/${id}/catalog-products`, organizationId),
  createCatalogProduct: (id: string, organizationId: string, body: Omit<CatalogProduct, 'id' | 'organizationId' | 'experienceId' | 'createdAt' | 'updatedAt'>) => apiRequest<CatalogProduct>(`/experiences/${id}/catalog-products`, organizationId, { method: 'POST', body: JSON.stringify(body) }),
  updateCatalogProduct: (id: string, organizationId: string, productId: string, body: Partial<Omit<CatalogProduct, 'id' | 'organizationId' | 'experienceId' | 'createdAt' | 'updatedAt'>>) => apiRequest<CatalogProduct>(`/experiences/${id}/catalog-products/${productId}`, organizationId, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveCatalogProduct: (id: string, organizationId: string, productId: string) => apiRequest<{ id: string; archived: boolean }>(`/experiences/${id}/catalog-products/${productId}`, organizationId, { method: 'DELETE' }),
  adjustCatalogStock: (id: string, organizationId: string, productId: string, delta: number) => apiRequest<CatalogProduct>(`/experiences/${id}/catalog-products/${productId}/stock`, organizationId, { method: 'POST', body: JSON.stringify({ delta }) }),
};
