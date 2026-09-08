export type PersistedExperienceStatus = 'draft' | 'published' | 'paused';
export type EffectiveExperienceStatus = PersistedExperienceStatus | 'scheduled' | 'active' | 'expired';

export function getEffectiveExperienceStatus(
  status: PersistedExperienceStatus,
  startsAt: string | null,
  endsAt: string | null,
  now = Date.now(),
): EffectiveExperienceStatus {
  if (status === 'draft' || status === 'paused') return status;
  if (startsAt && now < new Date(startsAt).getTime()) return 'scheduled';
  if (endsAt && now > new Date(endsAt).getTime()) return 'expired';
  return 'active';
}
