import { getEffectiveExperienceAccessStatus, getExperienceAccessPeriods } from './experience-access';

export async function hasCommercialAccess(db: D1Database, experienceId: string, organizationId: string) {
  const periods = await getExperienceAccessPeriods(db, experienceId, organizationId);
  return getEffectiveExperienceAccessStatus(periods) === 'active' || !periods.length;
}
