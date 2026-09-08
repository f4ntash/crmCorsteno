import type { Roulette3DConfig } from '@corsteno/roulette-3d';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
export type PublicExperienceResponse = { active: boolean; reason?: string; experience?: { type: string; config: Roulette3DConfig; startsAt: string | null; endsAt: string | null } };
export type SpinResult = { spinId: string; segmentIndex: number; segment: { id: string; prizeId: string | null }; prize: { id: string; name: string; iconUrl: string | null } | null };
export type ParticipationBlocked = { error: 'participation_limit_reached'; reason: 'device_limit' | 'session_limit' | 'cooldown' | 'identity_required'; message: string; retryAt?: string };
export class ParticipationBlockedError extends Error {
  readonly details: ParticipationBlocked;
  constructor(details: ParticipationBlocked) { super(details.message); this.name = 'ParticipationBlockedError'; this.details = details; }
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${api}${path}`, init);
  const data = await response.json() as T;
  if (!response.ok) {
    const error = data && typeof data === 'object' && data !== null && 'error' in data ? (data as { error?: unknown }).error : undefined;
    if (error === 'participation_limit_reached') throw new ParticipationBlockedError(data as ParticipationBlocked);
    throw new Error(data && typeof data === 'object' && data !== null && 'message' in data ? String((data as { message?: unknown }).message) : 'No se pudo completar la solicitud.');
  }
  return data;
}

export const publicExperiencesApi = {
  getExperience: (slug: string) => request<PublicExperienceResponse>(`/public/experiences/${encodeURIComponent(slug)}`),
  spin: (slug: string, identity: { deviceId: string; sessionId: string }) => request<SpinResult>(`/public/experiences/${encodeURIComponent(slug)}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity) }),
};
