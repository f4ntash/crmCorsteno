export type CommercialFeature =
  | 'roulette'
  | 'standard_3d'
  | 'webxr_ar'
  | 'custom_branding'
  | 'result_cta'
  | 'inventory'
  | 'participation_limits'
  | 'redemption_claims'
  | 'basic_analytics'
  | 'advanced_analytics'
  | 'premium_effects';

export type CommercialPlanCode = 'starter' | 'professional' | 'enterprise';

export type CommercialEntitlements = {
  features: CommercialFeature[];
  maxActiveExperiences: number | null;
};

export const COMMERCIAL_FEATURE_LABELS: Record<CommercialFeature, string> = {
  roulette: 'Ruleta',
  standard_3d: 'Renderer 3D estándar',
  webxr_ar: 'WebXR / AR',
  custom_branding: 'Branding y CTA avanzados',
  result_cta: 'CTA en resultados',
  inventory: 'Inventario de premios',
  participation_limits: 'Límites de participación',
  redemption_claims: 'Claims y canje de premios',
  basic_analytics: 'Analytics básico',
  advanced_analytics: 'Analytics avanzado',
  premium_effects: 'Efectos premium',
};

const STARTER_FEATURES: CommercialFeature[] = [
  'roulette', 'standard_3d', 'result_cta', 'inventory', 'participation_limits', 'basic_analytics',
];
const PROFESSIONAL_FEATURES: CommercialFeature[] = [
  ...STARTER_FEATURES, 'webxr_ar', 'custom_branding', 'redemption_claims', 'advanced_analytics', 'premium_effects',
];
const ENTERPRISE_FEATURES: CommercialFeature[] = [...PROFESSIONAL_FEATURES];

export const COMMERCIAL_PLAN_DEFINITIONS: Record<CommercialPlanCode, {
  code: CommercialPlanCode;
  name: string;
  description: string;
  features: CommercialFeature[];
  maxActiveExperiences: number | null;
  serviceNotes: string[];
}> = {
  starter: {
    code: 'starter', name: 'Starter',
    description: 'Para una activación de ruleta simple y lista para usar.',
    features: STARTER_FEATURES, maxActiveExperiences: 1,
    serviceNotes: ['Soporte estándar'],
  },
  professional: {
    code: 'professional', name: 'Professional',
    description: 'Para campañas con mayor personalización, AR y canje.',
    features: PROFESSIONAL_FEATURES, maxActiveExperiences: 3,
    serviceNotes: ['Soporte prioritario'],
  },
  enterprise: {
    code: 'enterprise', name: 'Enterprise',
    description: 'Para múltiples campañas y activaciones a medida.',
    features: ENTERPRISE_FEATURES, maxActiveExperiences: null,
    serviceNotes: ['Integraciones y tipos custom', 'Desarrollo y onboarding a medida'],
  },
};

export const ALL_COMMERCIAL_FEATURES = Object.keys(COMMERCIAL_FEATURE_LABELS) as CommercialFeature[];

export function getCommercialEntitlements(planCode: string): CommercialEntitlements | null {
  const definition = COMMERCIAL_PLAN_DEFINITIONS[planCode as CommercialPlanCode];
  return definition ? { features: [...definition.features], maxActiveExperiences: definition.maxActiveExperiences } : null;
}
