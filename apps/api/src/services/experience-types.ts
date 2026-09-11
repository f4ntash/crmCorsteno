import {
  validDraftConfig,
  validateRoulettePublishReadiness,
  type PublishReadinessIssue,
} from './roulette-config';

export type ExperienceTypeDefinition = {
  type: string;
  label: string;
  validateDraft: (value: unknown) => boolean;
  normalizeDraft?: (value: unknown) => unknown;
  validatePublishReadiness: (value: unknown) => PublishReadinessIssue[];
};

export type ExperienceTypeRegistry = ReadonlyMap<string, ExperienceTypeDefinition>;

export const rouletteExperienceType: ExperienceTypeDefinition = {
  type: 'roulette',
  label: 'Roulette',
  validateDraft: validDraftConfig,
  validatePublishReadiness: validateRoulettePublishReadiness,
};

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
