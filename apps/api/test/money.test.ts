import { describe, expect, it } from 'vitest';
import { formatMoneyFromMinor, parseMoneyToMinor } from '@corsteno/types';

describe('commercial money helpers', () => {
  it('parses decimal user input into minor units without floating point storage', () => {
    expect(parseMoneyToMinor('25000')).toBe(2500000);
    expect(parseMoneyToMinor('25000,50')).toBe(2500050);
    expect(parseMoneyToMinor('1.999')).toBeNull();
    expect(parseMoneyToMinor('-1')).toBeNull();
    expect(parseMoneyToMinor('')).toBeNull();
  });

  it('formats minor units with the selected currency', () => {
    expect(formatMoneyFromMinor(2500000, 'ARS')).toContain('25.000');
  });
});
