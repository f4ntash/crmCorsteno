import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from './runtimeConfig';

const config = { schemaVersion: 1 as const, backgroundColor: '#111111', branding: { logoUrl: '/assets/organizations/org/experiences/exp/123e4567-e89b-12d3-a456-426614174000.png' }, content: { title: 'Campaña', intro: 'Instrucciones' }, prizes: [], segments: [] };

describe('runtime campaign configuration', () => {
  it('keeps legacy configs valid without branding or content', () => {
    const legacy = { schemaVersion: 1 as const, backgroundColor: '#111111', prizes: [], segments: [] };
    expect(resolveRuntimeConfig(legacy, { features: [], maxActiveExperiences: 0 })).toEqual(legacy);
  });

  it('only exposes campaign branding to custom-branding entitlements', () => {
    expect(resolveRuntimeConfig(config, { features: [], maxActiveExperiences: 1 })).not.toHaveProperty('branding');
    expect(resolveRuntimeConfig(config, { features: ['custom_branding'], maxActiveExperiences: 3 })).toEqual(config);
  });
});
