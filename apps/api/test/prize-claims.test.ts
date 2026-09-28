import { describe, expect, it } from 'vitest';
import { generateClaimCode } from '../src/services/prize-claims';
import { validDraftConfig } from '../src/routes/experiences';

const segments = Array.from({ length: 6 }, (_, index) => ({ id: `segment-${index}`, color: '#D6B25E', prizeId: 'prize-1' }));

describe('roulette prize claims', () => {
  it('generates alternating letter-number codes', () => {
    const code = generateClaimCode();
    expect(code).toMatch(/^[A-Z][0-9][A-Z][0-9][A-Z][0-9][A-Z][0-9]$/);
  });
  it('accepts optional redemption configuration and preserves legacy prizes', () => {
    const base = { schemaVersion: 1, backgroundColor: '#111111', segments };
    expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'Remera', redemption: { enabled: true } }] })).toBe(true);
    expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'Remera' }] })).toBe(true);
    expect(validDraftConfig({ ...base, prizes: [{ id: 'prize-1', name: 'Remera', redemption: { enabled: 'yes' } }] })).toBe(false);
  });
});
