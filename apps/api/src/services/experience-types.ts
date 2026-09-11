import {
  validDraftConfig,
  validateRoulettePublishReadiness,
  type PublishReadinessIssue,
} from './roulette-config';

export type ExperienceTypeDefinition = {
  type: string;
  label: string;
  createDraftConfig: () => unknown;
  validateDraft: (value: unknown) => boolean;
  normalizeDraft?: (value: unknown) => unknown;
  validatePublishReadiness: (value: unknown) => PublishReadinessIssue[];
};

export type ExperienceTypeRegistry = ReadonlyMap<string, ExperienceTypeDefinition>;

export const rouletteExperienceType: ExperienceTypeDefinition = {
  type: 'roulette',
  label: 'Roulette',
  createDraftConfig: () => ({
    schemaVersion: 1,
    backgroundColor: '#111111',
    prizes: [{ id: 'no-prize', name: 'Sin premio', enabled: true, weight: 1, stockMode: 'unlimited' }],
    segments: [],
    participation: { maxSpinsPerDevice: 1, maxSpinsPerSession: null, cooldownSeconds: 0 },
  }),
  validateDraft: validDraftConfig,
  validatePublishReadiness: validateRoulettePublishReadiness,
};

export const defaultExperienceType = rouletteExperienceType.type;

export const experienceTypeRegistry: ExperienceTypeRegistry = new Map<string, ExperienceTypeDefinition>([
  [rouletteExperienceType.type, rouletteExperienceType],
]);

export function resolveExperienceType(type: unknown, registry: ExperienceTypeRegistry = experienceTypeRegistry) {
  return typeof type === 'string' ? registry.get(type) ?? null : null;
}

export function validateExperienceDraft(type: unknown, value: unknown, registry: ExperienceTypeRegistry = experienceTypeRegistry) {
  const definition = resolveExperienceType(type, registry);
  if (!definition) return { definition: null, valid: false as const, value };
  const normalized = definition.normalizeDraft ? definition.normalizeDraft(value) : value;
  return { definition, valid: definition.validateDraft(normalized), value: normalized };
}

export function validateExperiencePublishReadiness(type: unknown, value: unknown, registry: ExperienceTypeRegistry = experienceTypeRegistry) {
  const definition = resolveExperienceType(type, registry);
  return definition ? { definition, issues: definition.validatePublishReadiness(value) } : { definition: null, issues: [{ code: 'UNSUPPORTED_EXPERIENCE_TYPE', path: 'type', message: 'El tipo de experiencia no está soportado.' }] };
}

export type { PublishReadinessIssue };
