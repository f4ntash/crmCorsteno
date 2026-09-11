import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import type { CommercialEntitlements } from '@corsteno/types';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
export type InactivePublicExperienceResponse = { active: false; reason?: string };
export type ActivePublicExperienceResponse = {
  active: true;
  experience: {
    id: string;
    type: string;
    config: unknown;
    startsAt: string | null;
    endsAt: string | null;
    featureEntitlements: CommercialEntitlements;
    prizeAvailability?: Record<string, 'available' | 'sold_out'>;
    recovery?: SpinResult;
  };
};
export type PublicExperienceResponse = InactivePublicExperienceResponse | ActivePublicExperienceResponse;
export type SpinResult = { spinId: string; segmentIndex: number; segment: { id: string; prizeId: string | null }; prize: { id: string; name: string; iconUrl: string | null } | null; claim: { code: string; status: 'active' | 'redeemed' } | null; prizeAvailability?: Record<string, 'available' | 'sold_out'> };
export type ParticipationBlocked = { error: 'participation_limit_reached'; reason: 'device_limit' | 'session_limit' | 'cooldown' | 'identity_required'; message: string; retryAt?: string };
export class ParticipationBlockedError extends Error {
  readonly details: ParticipationBlocked;
  constructor(details: ParticipationBlocked) { super(details.message); this.name = 'ParticipationBlockedError'; this.details = details; }
}

async function request<T>(path: string, init?: RequestInit, allowedStatuses: number[] = []) {
  const response = await fetch(`${api}${path}`, init);
  const data = await response.json() as T;
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const error = data && typeof data === 'object' && data !== null && 'error' in data ? (data as { error?: unknown }).error : undefined;
    if (error === 'participation_limit_reached') throw new ParticipationBlockedError(data as ParticipationBlocked);
    throw new Error(data && typeof data === 'object' && data !== null && 'message' in data ? String((data as { message?: unknown }).message) : 'No se pudo completar la solicitud.');
  }
  return data;
}

export const publicExperiencesApi = {
  getPreview: (experienceId: string, organizationId: string) => request<{ config: Roulette3DConfig; prizeAvailability?: Record<string, 'available' | 'sold_out'>; featureEntitlements: CommercialEntitlements }>(`/experiences/${encodeURIComponent(experienceId)}/preview`, { credentials: 'include', headers: { 'X-Organization-Id': organizationId } }),
  getExperience: (slug: string, identity?: { deviceId: string; sessionId: string }) => request<PublicExperienceResponse>(`/public/experiences/${encodeURIComponent(slug)}`, identity ? { headers: { 'X-Anonymous-User-Id': identity.deviceId, 'X-Session-Id': identity.sessionId } } : undefined, [404]),
  spin: (slug: string, identity: { deviceId: string; sessionId: string }) => request<SpinResult>(`/public/experiences/${encodeURIComponent(slug)}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) }),
};
