import { apiRequest } from '../../shared/api/client';
import type { Experience } from './types';
export type ExperienceSpin = { id: string; experienceId: string; segmentId: string | null; segmentIndex: number; prizeId: string | null; outcomeType: 'prize' | 'no_prize'; createdAt: string };
export type PrizeClaim = { id: string; code: string; prizeId: string; prizeName: string; status: 'active' | 'redeemed'; createdAt: string; redeemedAt: string | null };

export const experiencesApi = {
  list: (organizationId: string) => apiRequest<Experience[]>('/experiences', organizationId),
  get: (id: string, organizationId: string) => apiRequest<Experience & { draftConfig: unknown; publishedConfig: unknown }>(`/experiences/${id}`, organizationId),
  create: (organizationId: string, body: unknown) => apiRequest('/experiences', organizationId, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, organizationId: string, body: unknown) => apiRequest(`/experiences/${id}`, organizationId, { method: 'PATCH', body: JSON.stringify(body) }),
  publish: (id: string, organizationId: string) => apiRequest(`/experiences/${id}/publish`, organizationId, { method: 'POST' }),
  uploadAsset: (id: string, organizationId: string, file: File) => { const body = new FormData(); body.append('file', file); return apiRequest(`/experiences/${id}/assets`, organizationId, { method: 'POST', body }); },
  inventory: (id: string, organizationId: string) => apiRequest<{ items: Array<{ prizeId: string; name: string; iconUrl: string | null; enabled: boolean; weight: number; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }> }>(`/experiences/${id}/inventory`, organizationId),
  adjustInventory: (id: string, organizationId: string, prizeId: string, delta: number) => apiRequest<{ item: { prizeId: string; stockAvailable: number | null; deliveredCount: number } }>(`/experiences/${id}/inventory/${prizeId}/adjust`, organizationId, { method: 'POST', body: JSON.stringify({ delta }) }),
  spins: (id: string, organizationId: string, params: { limit?: number; offset?: number; outcome?: string; prizeId?: string; from?: string; to?: string } = {}) => { const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '') as [string, string][]).toString(); return apiRequest<{ items: ExperienceSpin[]; pagination: { limit: number; offset: number; nextOffset: number | null } }>(`/experiences/${id}/spins${query ? `?${query}` : ''}`, organizationId); },
  claims: (id: string, organizationId: string, code?: string) => apiRequest<{ items: PrizeClaim[]; pagination: { nextOffset: number | null } }>(`/experiences/${id}/claims${code ? `?code=${encodeURIComponent(code)}` : ''}`, organizationId),
  redeemClaim: (id: string, organizationId: string, claimId: string) => apiRequest<PrizeClaim>(`/experiences/${id}/claims/${claimId}/redeem`, organizationId, { method: 'POST' }),
};
