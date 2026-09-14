import { describe, expect, it } from 'vitest';
import {
  experienceTypeRegistry,
  resolveExperienceType,
  rouletteExperienceType,
  websiteExperienceType,
  arExperienceType,
  validateExperienceDraft,
  validateExperiencePublishReadiness,
  type ExperienceTypeDefinition,
} from '../src/services/experience-types';
import { validDraftConfig, validateRoulettePublishReadiness } from '../src/services/roulette-config';
import { rouletteDraftFieldErrors } from '@corsteno/types';

describe('experience type registry', () => {
  it('keeps Roulette validation behind the registered type definition', () => {
    expect(resolveExperienceType('roulette')).toBe(rouletteExperienceType);
    expect(rouletteExperienceType.validateDraft).toBe(validDraftConfig);
    expect(rouletteExperienceType.validatePublishReadiness).toBe(validateRoulettePublishReadiness);
  });

  it('supports a second type through a test-only registry without a Roulette fallback', () => {
    const secondType: ExperienceTypeDefinition = {
      type: 'test-event',
      label: 'Evento de prueba',
      createDraftConfig: () => ({ title: 'Evento' }),
      validateDraft: (value) => Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).title === 'Evento'),
      normalizeDraft: (value) => ({ ...(value as Record<string, unknown>), normalized: true }),
      validatePublishReadiness: (value) => value && typeof value === 'object' && (value as Record<string, unknown>).normalized === true ? [] : [{ code: 'TEST_NOT_READY', path: 'config', message: 'El evento de prueba no está listo.' }],
    };
    const registry = new Map(experienceTypeRegistry).set(secondType.type, secondType);

    expect(resolveExperienceType(secondType.type, registry)).toBe(secondType);
    const draft = validateExperienceDraft(secondType.type, { title: 'Evento' }, registry);
    expect(draft).toMatchObject({ definition: secondType, valid: true, value: { title: 'Evento', normalized: true } });
    expect(validateExperiencePublishReadiness(secondType.type, draft.value, registry)).toMatchObject({ definition: secondType, issues: [] });
    expect(validateExperienceDraft('missing-type', {}, registry)).toMatchObject({ definition: null, valid: false });
    expect(validateExperiencePublishReadiness('missing-type', {}, registry)).toEqual({ definition: null, issues: [{ code: 'UNSUPPORTED_EXPERIENCE_TYPE', path: 'type', message: 'El tipo de experiencia no está soportado.' }] });
  });

  it('registers Web and AR as explicit CRM product records without exposing a Roulette editor', () => {
    expect(resolveExperienceType('website')).toBe(websiteExperienceType);
    expect(resolveExperienceType('ar')).toBe(arExperienceType);
    expect(websiteExperienceType.createDraftConfig()).toEqual({ schemaVersion: 1 });
    expect(arExperienceType.validatePublishReadiness({ schemaVersion: 1 })).toEqual([]);
  });
});

describe('Roulette editor validation', () => {
  const base = {
    schemaVersion: 1,
    backgroundColor: '#111111',
    prizes: [{ id: 'p1', name: 'Premio', weight: 1, stockMode: 'unlimited' as const }],
    segments: Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, color: '#D6B25E', prizeId: 'p1' })),
  };

  it('shares concrete field rules with the API validator', () => {
    const invalid = { ...base, prizes: [{ id: 'p1', name: ' '.repeat(3), weight: -1, stockMode: 'limited' as const, initialStock: -1 }] };
    expect(Object.keys(rouletteDraftFieldErrors(invalid))).toEqual(expect.arrayContaining(['prizes[0].name', 'prizes[0].weight', 'prizes[0].initialStock']));
    expect(validDraftConfig(invalid)).toBe(false);
    expect(validateRoulettePublishReadiness(invalid)).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'prizes[0].weight', code: 'PRIZE_INVALID' })]));
  });

  it('keeps legacy omitted fields valid while enforcing copy and participation limits', () => {
    expect(validDraftConfig(base)).toBe(true);
    expect(validDraftConfig({ ...base, content: {} })).toBe(true);
    expect(validDraftConfig({ ...base, content: { title: 'x'.repeat(121) } })).toBe(false);
    expect(validDraftConfig({ ...base, participation: { maxSpinsPerDevice: 0, maxSpinsPerSession: null, cooldownSeconds: 0 } })).toBe(false);
  });
});
