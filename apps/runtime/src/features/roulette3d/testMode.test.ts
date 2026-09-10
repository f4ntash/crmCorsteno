import { describe, expect, it } from 'vitest';
import { simulateTestSpin } from './Roulette3DView';

const config = {
  schemaVersion: 1 as const,
  backgroundColor: '#111111',
  prizes: [
    { id: 'sold', name: 'Agotado', weight: 9, enabled: true },
    { id: 'valid', name: 'Disponible', weight: 1, enabled: true },
  ],
  segments: [
    { id: 's1', color: '#111111', prizeId: 'sold' },
    { id: 's2', color: '#222222', prizeId: 'valid' },
    { id: 's3', color: '#333333', prizeId: null },
  ],
};

describe('roulette test mode selection', () => {
  it('returns a local result without a claim and excludes sold-out prizes', () => {
    const result = simulateTestSpin(config, { sold: 'sold_out', valid: 'available' });
    expect(result.claim).toBeNull();
    expect(['valid', null]).toContain(result.prize?.id ?? null);
    expect(['s2', 's3']).toContain(result.segment.id);
    expect(result.spinId).toMatch(/^test-/);
  });
});
