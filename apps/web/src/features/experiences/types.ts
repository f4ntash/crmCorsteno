export type ExperienceStatus = 'draft' | 'published' | 'paused';
export type EffectiveExperienceStatus = ExperienceStatus | 'scheduled' | 'active' | 'expired';
export type Experience = { id: string; name: string; slug: string; type: string; applicationId?: string | null; status?: ExperienceStatus; effective_status: EffectiveExperienceStatus; access_status?: string; starts_at: string | null; ends_at: string | null };
export type ExperienceTemplate = { id: string; type: 'roulette' | 'product-catalog'; name: string; description: string };
