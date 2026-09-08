export type ExperienceStatus = 'draft' | 'published' | 'paused';
export type EffectiveExperienceStatus = ExperienceStatus | 'scheduled' | 'active' | 'expired';
export type Experience = { id: string; name: string; slug: string; type: string; status?: ExperienceStatus; effective_status: EffectiveExperienceStatus; starts_at: string | null; ends_at: string | null };
