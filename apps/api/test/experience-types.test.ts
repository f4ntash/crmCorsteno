import { describe, expect, it } from 'vitest';
import {
  experienceTypeRegistry,
  resolveExperienceType,
  rouletteExperienceType,
  validateExperienceDraft,
  validateExperiencePublishReadiness,
  type ExperienceTypeDefinition,
} from '../src/services/experience-types';
import { validDraftConfig, validateRoulettePublishReadiness } from '../src/services/roulette-config';

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
});
