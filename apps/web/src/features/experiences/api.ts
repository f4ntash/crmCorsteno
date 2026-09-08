import { apiRequest } from '../../shared/api/client';
import type { Experience } from './types';

export const experiencesApi = {
  list: (organizationId: string) => apiRequest<Experience[]>('/experiences', organizationId),
  get: (id: string, organizationId: string) => apiRequest<Experience & { draftConfig: unknown; publishedConfig: unknown }>(`/experiences/${id}`, organizationId),
  create: (organizationId: string, body: unknown) => apiRequest('/experiences', organizationId, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, organizationId: string, body: unknown) => apiRequest(`/experiences/${id}`, organizationId, { method: 'PATCH', body: JSON.stringify(body) }),
  publish: (id: string, organizationId: string) => apiRequest(`/experiences/${id}/publish`, organizationId, { method: 'POST' }),
  uploadAsset: (id: string, organizationId: string, file: File) => { const body = new FormData(); body.append('file', file); return apiRequest(`/experiences/${id}/assets`, organizationId, { method: 'POST', body }); },
  inventory: (id: string, organizationId: string) => apiRequest<{ items: Array<{ prizeId: string; name: string; iconUrl: string | null; enabled: boolean; weight: number; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number }> }>(`/experiences/${id}/inventory`, organizationId),
  adjustInventory: (id: string, organizationId: string, prizeId: string, delta: number) => apiRequest<{ item: { prizeId: string; stockAvailable: number | null; deliveredCount: number } }>(`/experiences/${id}/inventory/${prizeId}/adjust`, organizationId, { method: 'POST', body: JSON.stringify({ delta }) }),
};
