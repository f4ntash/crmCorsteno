import {
  validDraftConfig,
  validateRoulettePublishReadiness,
  type PublishReadinessIssue,
} from './roulette-config';
import { PRODUCT_CATALOG_TYPE, createDefaultProductCatalogConfig, productCatalogDraftIssues, validateProductCatalogDraft, validateProductCatalogPublishReadiness } from './product-catalog';
import type { D1Database } from '@cloudflare/workers-types';
import type { CrmProductType } from '@corsteno/types';

export type ExperienceTypeDefinition = {
  type: string;
  label: string;
  createDraftConfig: () => unknown;
  validateDraft: (value: unknown) => boolean;
  normalizeDraft?: (value: unknown) => unknown;
  validatePublishReadiness: (value: unknown) => PublishReadinessIssue[];
  validatePublishReadinessWithContext?: (value: unknown, context: { db: D1Database; experienceId: string; organizationId: string }) => Promise<PublishReadinessIssue[]>;
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

export const productCatalogExperienceType: ExperienceTypeDefinition = {
  type: PRODUCT_CATALOG_TYPE,
  label: 'Catálogo de productos',
  createDraftConfig: createDefaultProductCatalogConfig,
  validateDraft: validateProductCatalogDraft,
  validatePublishReadiness: productCatalogDraftIssues,
  validatePublishReadinessWithContext: (value, context) => validateProductCatalogPublishReadiness(context.db, context.experienceId, context.organizationId, value),
};

function registryOnlyExperienceType(type: Exclude<CrmProductType, 'roulette' | 'product-catalog'>, label: string): ExperienceTypeDefinition {
  return {
    type,
    label,
    createDraftConfig: () => ({ schemaVersion: 1 }),
    validateDraft: (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
    validatePublishReadiness: () => [],
  };
}

/** Website and AR are canonical CRM assignments, not editors. Their records
 * can be listed and identified without pretending the CRM owns their runtime. */
export const websiteExperienceType = registryOnlyExperienceType('website', 'Web');
export const arExperienceType = registryOnlyExperienceType('ar', 'AR');

export const defaultExperienceType = rouletteExperienceType.type;

export const experienceTypeRegistry: ExperienceTypeRegistry = new Map<string, ExperienceTypeDefinition>([
  [rouletteExperienceType.type, rouletteExperienceType],
  [productCatalogExperienceType.type, productCatalogExperienceType],
  [websiteExperienceType.type, websiteExperienceType],
  [arExperienceType.type, arExperienceType],
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
