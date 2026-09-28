import { describe, expect, it } from 'vitest';
import { normalizeRedeemableClaimCode } from '@corsteno/types';
import { generateClaimCode } from '../src/services/prize-claims';

describe('redeemable claim code format', () => {
  it.each([
    ['A1B2C3D4', 'A1B2C3D4'],
    ['a1b2c3d4', 'A1B2C3D4'],
    ['ABCD2345-EFGH6789', 'ABCD2345-EFGH6789'],
    ['abcd2345-efgh6789', 'ABCD2345-EFGH6789'],
    ['CANONICAL-00000001', 'CANONICAL-00000001'],
  ])('accepts %s and normalizes it to uppercase', (input, expected) => {
    expect(normalizeRedeemableClaimCode(input)).toBe(expected);
  });

  it.each(['ABCD1234', '1234ABCD', 'A1B2C3D', 'A1-B2-C3-D4', 'A1B2C3D45', 'A1B2C3D4!', ' A1B2C3D4', 'A1B2C3D4 '])('rejects %s', (input) => {
    expect(normalizeRedeemableClaimCode(input)).toBeNull();
  });

  it('generates codes in the accepted alternating format', () => {
    expect(normalizeRedeemableClaimCode(generateClaimCode())).toMatch(/^[A-Z][0-9][A-Z][0-9][A-Z][0-9][A-Z][0-9]$/);
  });
});
