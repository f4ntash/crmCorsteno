import { describe, expect, it } from 'vitest';
import { FINDER_LOCATION_MIN_LENGTH, isValidFinderLocation } from '@corsteno/types';

describe('Finder location validation', () => {
  it('uses the shared two-character minimum after trimming', () => {
    expect(FINDER_LOCATION_MIN_LENGTH).toBe(2);
    expect(isValidFinderLocation('a')).toBe(false);
    expect(isValidFinderLocation(' a ')).toBe(false);
    expect(isValidFinderLocation('ab')).toBe(true);
    expect(isValidFinderLocation(' a b ')).toBe(true);
    expect(isValidFinderLocation('  ')).toBe(false);
  });
});
