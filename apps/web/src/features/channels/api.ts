import { apiRequest } from '../../shared/api/client';

export type ChannelType = 'external_site' | 'corsteno_site' | 'hosted_runtime';
export type ChannelStatus = 'active' | 'inactive';
export type ChannelExperience = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};
export type Channel = {
  id: string;
  organizationId: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  url: string | null;
  createdAt: number;
  updatedAt: number;
  publicKey: string | null;
  linkedExperienceCount?: number;
  experiences?: ChannelExperience[];
  products?: ChannelProductsState;
};
export type ChannelProduct = { id: string; productKey: string; name: string; status: 'active' | 'archived'; published: boolean; visible: boolean; sortOrder: number };
export type ChannelProductsState = { draft: ChannelProduct[]; published: ChannelProduct[]; hasUnpublishedChanges: boolean };

export type SiteContentFieldDefinition = {
  key: string;
  type: 'text' | 'textarea' | 'image' | 'url' | 'boolean';
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
};
export type SiteContentProfile = {
  key: string;
  version: number;
  name: string;
  description: string;
  sections: Array<{ id: string; title: string; description?: string; fields: SiteContentFieldDefinition[] }>;
};
export type SiteContent = {
  hero: { title: string; description: string; image: string | null; ctaLabel: string; ctaUrl: string };
  promotion: { enabled: boolean; title: string; description: string; image: string | null; ctaLabel: string; ctaUrl: string };
};
export type ChannelContent = {
  supported: boolean;
  channel: Pick<Channel, 'id' | 'name' | 'type'>;
  profile: SiteContentProfile | null;
  draftContent: SiteContent | null;
  publishedContent: SiteContent | null;
  publishedAt: number | null;
  hasUnpublishedChanges: boolean;
};

export const channelTypeLabels: Record<ChannelType, string> = {
  external_site: 'Sitio existente',
  corsteno_site: 'Sitio creado por Corsteno',
  hosted_runtime: 'Alojado por Corsteno',
};

export function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export const channelsApi = {
  list: (organizationId: string) => apiRequest<Channel[]>('/channels', organizationId),
  get: (id: string, organizationId: string) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}`, organizationId),
  create: (organizationId: string, body: { name: string; type: ChannelType; url?: string | null }) => apiRequest<Channel>('/channels', organizationId, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, organizationId: string, body: { name?: string; status?: ChannelStatus; url?: string | null }) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}`, organizationId, { method: 'PATCH', body: JSON.stringify(body) }),
  linkExperience: (id: string, organizationId: string, experienceId: string) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/experiences`, organizationId, { method: 'POST', body: JSON.stringify({ experienceId }) }),
  unlinkExperience: (id: string, organizationId: string, experienceId: string) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/experiences/${encodeURIComponent(experienceId)}`, organizationId, { method: 'DELETE' }),
  addProduct: (id: string, organizationId: string, productId: string) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/products`, organizationId, { method: 'POST', body: JSON.stringify({ productId }) }),
  removeProduct: (id: string, organizationId: string, productId: string) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/products/${encodeURIComponent(productId)}`, organizationId, { method: 'DELETE' }),
  updateProduct: (id: string, organizationId: string, productId: string, visible: boolean) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/products/${encodeURIComponent(productId)}`, organizationId, { method: 'PATCH', body: JSON.stringify({ visible }) }),
  reorderProducts: (id: string, organizationId: string, productIds: string[]) => apiRequest<Channel>(`/channels/${encodeURIComponent(id)}/products/reorder`, organizationId, { method: 'POST', body: JSON.stringify({ productIds }) }),
  getContent: (id: string, organizationId: string) => apiRequest<ChannelContent>(`/channels/${encodeURIComponent(id)}/content`, organizationId),
  assignContentProfile: (id: string, organizationId: string, profileKey: string) => apiRequest<ChannelContent>(`/channels/${encodeURIComponent(id)}/content-profile`, organizationId, { method: 'PUT', body: JSON.stringify({ profileKey }) }),
  saveContent: (id: string, organizationId: string, content: SiteContent) => apiRequest<ChannelContent>(`/channels/${encodeURIComponent(id)}/content`, organizationId, { method: 'PATCH', body: JSON.stringify({ content }) }),
  publishContent: (id: string, organizationId: string) => apiRequest<ChannelContent>(`/channels/${encodeURIComponent(id)}/content/publish`, organizationId, { method: 'POST' }),
};
