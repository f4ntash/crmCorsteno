import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import type { CommercialEntitlements, SurfaceMaterialConfig } from '@corsteno/types';
import { runtimeApiBaseUrl as api } from '../config/runtimeEnvironment';
export type InactivePublicExperienceResponse = { active: false; reason?: string };
export type ActivePublicExperienceResponse = {
  active: true;
  experience: {
    type: string;
    config: unknown;
    startsAt: string | null;
    endsAt: string | null;
    featureEntitlements: CommercialEntitlements;
    prizeAvailability?: Record<string, 'available' | 'sold_out'>;
    recovery?: SpinResult;
    products?: CatalogPublicProduct[];
  };
};
export type CatalogPublicProduct = { id: string; name: string; description: string; priceMinorUnits: number; currency: string; priceUnit?: string | null; metadata?: Record<string, string | number | boolean | null> | null; stock: number; mainImageUrl: string | null; gallery: string[]; ctaLabel: string | null; ctaUrl: string | null; surfaceConfig?: SurfaceMaterialConfig | null };
export type PublicExperienceResponse = InactivePublicExperienceResponse | ActivePublicExperienceResponse;
export type SpinResult = { spinId: string; segmentIndex: number; segment: { id: string; prizeId: string | null }; prize: { id: string; name: string; iconUrl: string | null } | null; claim: { code: string; status: 'active' | 'redeemed' } | null; prizeAvailability?: Record<string, 'available' | 'sold_out'> };
export type ParticipationBlocked = { error: 'participation_limit_reached'; reason: 'device_limit' | 'session_limit' | 'cooldown' | 'identity_required'; message: string; retryAt?: string };
export class ParticipationBlockedError extends Error {
  readonly details: ParticipationBlocked;
  constructor(details: ParticipationBlocked) { super(details.message); this.name = 'ParticipationBlockedError'; this.details = details; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSpinResult(value: unknown): value is SpinResult {
  if (!isRecord(value) || typeof value.spinId !== 'string' || typeof value.segmentIndex !== 'number' || !Number.isInteger(value.segmentIndex) || value.segmentIndex < 0) return false;
  if (!isRecord(value.segment) || typeof value.segment.id !== 'string' || (value.segment.prizeId !== null && typeof value.segment.prizeId !== 'string')) return false;
  if (!('prize' in value) || value.prize !== null && (!isRecord(value.prize) || typeof value.prize.id !== 'string' || typeof value.prize.name !== 'string' || (value.prize.iconUrl !== null && typeof value.prize.iconUrl !== 'string'))) return false;
  if (!('claim' in value) || value.claim !== null && (!isRecord(value.claim) || typeof value.claim.code !== 'string' || (value.claim.status !== 'active' && value.claim.status !== 'redeemed'))) return false;
  if (value.prizeAvailability !== undefined && (!isRecord(value.prizeAvailability) || Object.values(value.prizeAvailability).some((item) => item !== 'available' && item !== 'sold_out'))) return false;
  return true;
}

async function request<T>(path: string, init?: RequestInit, allowedStatuses: number[] = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${api}${path}`, { ...init, signal: controller.signal });
    let data: T;
    try { data = await response.json() as T; } catch { throw new Error('invalid_response'); }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const error = data && typeof data === 'object' && data !== null && 'error' in data ? (data as { error?: unknown }).error : undefined;
      if (error === 'participation_limit_reached') throw new ParticipationBlockedError(data as ParticipationBlocked);
      throw new Error('request_failed');
    }
    return data;
  } catch (error) {
    if (error instanceof ParticipationBlockedError) throw error;
    throw new Error('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
  } finally {
    clearTimeout(timeout);
  }
}

export const publicExperiencesApi = {
  getPreview: (experienceId: string, organizationId: string) => request<{ config: Roulette3DConfig; prizeAvailability?: Record<string, 'available' | 'sold_out'>; featureEntitlements: CommercialEntitlements }>(`/experiences/${encodeURIComponent(experienceId)}/preview`, { credentials: 'include', headers: { 'X-Organization-Id': organizationId } }),
  getExperience: (slug: string, identity?: { deviceId: string; sessionId: string }) => request<PublicExperienceResponse>(`/public/experiences/${encodeURIComponent(slug)}`, identity ? { headers: { 'X-Anonymous-User-Id': identity.deviceId, 'X-Session-Id': identity.sessionId } } : undefined, [404]),
  async spin(slug: string, identity: { deviceId: string; sessionId: string }, requestId: string = crypto.randomUUID()) {
    const result = await request<unknown>(`/public/experiences/${encodeURIComponent(slug)}/spin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identity, requestId }) });
    if (!isSpinResult(result)) throw new Error('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
    return result;
  },
};
