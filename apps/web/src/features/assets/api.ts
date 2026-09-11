import { apiRequest } from '../../shared/api/client';

export type OrganizationAsset = {
  id: string;
  url: string;
  originalFilename: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  category: string;
  createdAt: string | number;
  updatedAt: string | number;
};

type AssetList = {
  items: OrganizationAsset[];
  pagination: { limit: number; offset: number; nextOffset: number | null };
};

export const assetsApi = {
  list: (organizationId: string, params: { limit?: number; offset?: number; category?: string; search?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '') as [string, string][]).toString();
    return apiRequest<AssetList>(`/organizations/assets${query ? `?${query}` : ''}`, organizationId);
  },
  upload: (organizationId: string, file: File, category = 'image', displayName?: string) => {
    const body = new FormData();
    body.append('file', file);
    body.append('category', category);
    if (displayName) body.append('display_name', displayName);
    return apiRequest<OrganizationAsset>('/organizations/assets', organizationId, { method: 'POST', body });
  },
  rename: (organizationId: string, id: string, displayName: string) => apiRequest<OrganizationAsset>(`/organizations/assets/${id}`, organizationId, { method: 'PATCH', body: JSON.stringify({ displayName }) }),
  archive: (organizationId: string, id: string) => apiRequest<{ id: string; archived: boolean; referenced: boolean }>(`/organizations/assets/${id}`, organizationId, { method: 'DELETE' }),
};
