import { describe, expect, it } from 'vitest';
import { getEffectiveExperienceAccessStatus } from '../src/services/experience-access';

const now = Date.parse('2026-09-15T12:00:00.000Z');
const period = (startsAt: string, endsAt: string) => ({ startsAt, endsAt });

describe('experience commercial access status', () => {
  it('keeps experiences without periods legacy-unrestricted', () =>
    expect(getEffectiveExperienceAccessStatus([], now)).toBe(
      'legacy_unrestricted',
    ));
  it('returns scheduled for a future period', () =>
    expect(
      getEffectiveExperienceAccessStatus(
        [period('2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z')],
        now,
      ),
    ).toBe('scheduled'));
  it('returns active inside a period', () =>
    expect(
      getEffectiveExperienceAccessStatus(
        [period('2026-09-01T00:00:00.000Z', '2026-09-30T00:00:00.000Z')],
        now,
      ),
    ).toBe('active'));
  it('returns expired when all periods have ended', () =>
    expect(
      getEffectiveExperienceAccessStatus(
        [period('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')],
        now,
      ),
    ).toBe('expired'));
  it('treats overlapping periods as active', () =>
    expect(
      getEffectiveExperienceAccessStatus(
        [
          period('2026-09-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z'),
          period('2026-09-15T00:00:00.000Z', '2026-10-15T00:00:00.000Z'),
        ],
        now,
      ),
    ).toBe('active'));
  it('returns scheduled when a later separated period is upcoming', () =>
    expect(
      getEffectiveExperienceAccessStatus(
        [
          period('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z'),
          period('2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ],
        now,
      ),
    ).toBe('scheduled'));
  it('includes the start boundary and excludes the end boundary', () => {
    const p = period('2026-09-15T12:00:00.000Z', '2026-09-16T12:00:00.000Z');
    expect(
      getEffectiveExperienceAccessStatus([p], Date.parse(p.startsAt)),
    ).toBe('active');
    expect(getEffectiveExperienceAccessStatus([p], Date.parse(p.endsAt))).toBe(
      'expired',
    );
  });
});
