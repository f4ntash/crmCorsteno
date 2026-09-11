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
  linkedExperienceCount?: number;
  experiences?: ChannelExperience[];
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
};
