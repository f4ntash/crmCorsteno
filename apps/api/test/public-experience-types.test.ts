import { describe, expect, it } from 'vitest';
import {
  publicExperienceRegistry,
  resolvePublicExperienceAdapter,
  type PublicExperienceAdapter,
  type PublicExperienceAdapterContext,
} from '../src/services/public-experience-types';

const testAdapter: PublicExperienceAdapter<{ type: 'test-event'; label: string }> = {
  type: 'test-event',
  async buildPublicPayload({ experience }) {
    return { kind: 'ready', payload: { type: 'test-event', label: experience.name } };
  },
};

const context: PublicExperienceAdapterContext = {
  db: {} as D1Database,
  experience: {
    id: 'experience-1',
    organizationId: 'org-1',
    name: 'Evento de prueba',
    type: 'test-event',
    publishedConfig: '{"notRoulette":true}',
    startsAt: null,
    endsAt: null,
  },
  featureEntitlements: { features: [], maxActiveExperiences: 0 },
  deviceId: null,
  sessionId: null,
};

describe('public experience type dispatch', () => {
  it('resolves Roulette through the production registry', () => {
    expect(resolvePublicExperienceAdapter('roulette')).toBe(publicExperienceRegistry.get('roulette'));
  });

  it('lets a test-only product build its own public payload', async () => {
    const registry = new Map(publicExperienceRegistry);
    registry.set(testAdapter.type, testAdapter);
    const adapter = resolvePublicExperienceAdapter('test-event', registry);
    expect(adapter).toBe(testAdapter);
    await expect(adapter?.buildPublicPayload(context)).resolves.toEqual({ kind: 'ready', payload: { type: 'test-event', label: 'Evento de prueba' } });
  });

  it('does not resolve unknown types', () => {
    expect(resolvePublicExperienceAdapter('missing-product')).toBeNull();
    expect(resolvePublicExperienceAdapter(42)).toBeNull();
  });
});
