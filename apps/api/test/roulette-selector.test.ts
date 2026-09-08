import { describe, expect, it } from 'vitest';
import { secureRandomIndex, selectRouletteSegment } from '../src/services/roulette-selector';

describe('roulette selector', () => {
  it.each([6, 8, 10])('maps injected random values uniformly for %i segments', (count) => {
    const config = { segments: Array.from({ length: count }) };
    expect(selectRouletteSegment(config, 0)).toBe(0);
    expect(selectRouletteSegment(config, 0.999999)).toBe(count - 1);
    expect(selectRouletteSegment(config, (count - 1) / count + 0.000001)).toBe(count - 1);
  });

  it('returns a secure index in range', () => {
    for (const count of [6, 8, 10]) {
      const result = secureRandomIndex(count);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(count);
    }
  });
});
