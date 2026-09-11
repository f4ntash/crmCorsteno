import { describe, expect, it } from 'vitest';
import { getEffectiveExperienceStatus } from '../src/services/experience-status';

const NOW = Date.parse('2026-06-15T12:00:00Z');
describe('effective experience status', () => {
  it.each([
    ['draft', null, null, 'draft'],
    ['paused', null, null, 'paused'],
    ['published', '2026-06-16T00:00:00Z', null, 'scheduled'],
    ['published', '2026-06-14T00:00:00Z', '2026-06-16T00:00:00Z', 'active'],
    ['published', null, '2026-06-14T00:00:00Z', 'expired'],
    ['published', null, null, 'active'],
    ['published', '2026-06-14T00:00:00Z', null, 'active'],
  ] as const)('%s calculates %s', (status, startsAt, endsAt, expected) => {
    expect(getEffectiveExperienceStatus(status, startsAt, endsAt, NOW)).toBe(expected);
  });

  it('keeps the existing inclusive start and end boundary semantics', () => {
    const start = '2026-06-15T12:00:00Z';
    const end = '2026-06-15T12:00:00Z';

    expect(getEffectiveExperienceStatus('published', start, null, NOW)).toBe('active');
    expect(getEffectiveExperienceStatus('published', null, end, NOW)).toBe('active');
    expect(getEffectiveExperienceStatus('published', null, end, NOW + 1)).toBe('expired');
  });
});
