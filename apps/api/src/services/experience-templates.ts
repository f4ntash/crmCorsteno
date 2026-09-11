import type { DraftConfig } from './roulette-config';
import { PRODUCT_CATALOG_TYPE, type ProductCatalogConfig } from './product-catalog';

export type ExperienceTemplateType = 'roulette' | typeof PRODUCT_CATALOG_TYPE;

export type ExperienceTemplate = {
  id: string;
  type: ExperienceTemplateType;
  name: string;
  description: string;
  createConfig: () => unknown;
};

const rouletteColors = ['#D6B25E', '#79A7D3', '#9BC47D', '#C0A1D8', '#D88C8C', '#6FB6A8', '#E0A15B', '#8E9CC8', '#C98BBA', '#A6B66F'];

function rouletteConfig(
  backgroundColor: string,
  prizes: DraftConfig['prizes'],
  assignments: Array<string | null>,
  effects: DraftConfig['effects'] = { sound: true, vibration: true, celebration: true },
): DraftConfig {
  return {
    schemaVersion: 1,
    backgroundColor,
    prizes,
    segments: assignments.map((prizeId, index) => ({
      id: `segment-${index + 1}`,
      color: rouletteColors[index % rouletteColors.length]!,
      prizeId,
    })),
    effects,
    participation: {
      maxSpinsPerDevice: null,
      maxSpinsPerSession: null,
      cooldownSeconds: 0,
    },
  };
}

const rouletteEventConfig = () => {
  const prizes: DraftConfig['prizes'] = [
    { id: 'prize-main', name: 'Premio principal', enabled: true, weight: 1, stockMode: 'limited', initialStock: 10, redemption: { enabled: true } },
    { id: 'prize-secondary', name: 'Premio secundario', enabled: true, weight: 2, stockMode: 'limited', initialStock: 25, redemption: { enabled: true } },
    { id: 'prize-surprise', name: 'Premio sorpresa', enabled: true, weight: 3, stockMode: 'unlimited', redemption: { enabled: true } },
  ];
  return {
    ...rouletteConfig('#111820', prizes, ['prize-main', 'prize-secondary', 'prize-surprise', null, 'prize-secondary', 'prize-surprise', null, 'prize-surprise']),
    content: {
      title: 'Ruleta de premios',
      intro: 'Participá y descubrí qué premio te toca.',
      spinButtonLabel: 'Girar',
      winMessage: '¡Felicitaciones! Ganaste un premio.',
      noPrizeMessage: 'Gracias por participar.',
    },
  };
};

const rouletteLocalConfig = () => {
  const prizes: DraftConfig['prizes'] = [
    { id: 'prize-discount', name: 'Descuento promocional', enabled: true, weight: 3, stockMode: 'unlimited', redemption: { enabled: true } },
    { id: 'prize-gift', name: 'Regalo promocional', enabled: true, weight: 2, stockMode: 'unlimited', redemption: { enabled: true } },
  ];
  return {
    ...rouletteConfig('#F4F1EA', prizes, ['prize-discount', 'prize-gift', null, 'prize-discount', 'prize-gift', null], { sound: true, vibration: true, celebration: true }),
    content: {
      title: 'Promoción especial',
      intro: 'Girá para descubrir tu beneficio.',
      spinButtonLabel: 'Girar ahora',
      winMessage: '¡Ganaste! Mostrá este resultado en el local.',
      noPrizeMessage: 'Esta vez no hubo premio. ¡Gracias por participar!',
    },
  };
};

const rouletteBrandActivationConfig = () => {
  const prizes: DraftConfig['prizes'] = [
    { id: 'prize-main', name: 'Premio principal', enabled: true, weight: 1, stockMode: 'unlimited', redemption: { enabled: true } },
    { id: 'prize-benefit', name: 'Beneficio especial', enabled: true, weight: 2, stockMode: 'unlimited', redemption: { enabled: true } },
  ];
  return {
    ...rouletteConfig('#172331', prizes, ['prize-main', 'prize-benefit', null, 'prize-benefit', 'prize-main', null, 'prize-benefit', null], { sound: true, vibration: false, celebration: true }),
    content: {
      title: 'Activación de marca',
      intro: 'Participá de la activación y descubrí tu resultado.',
      spinButtonLabel: 'Participar',
      winMessage: '¡Felicitaciones! Tenemos una sorpresa para vos.',
      noPrizeMessage: 'Gracias por participar en la activación.',
    },
  };
};

const catalogCommercialConfig = (): ProductCatalogConfig => ({ schemaVersion: 1, title: 'Catálogo comercial', intro: 'Explorá nuestra selección de productos.' });

export const experienceTemplates: readonly ExperienceTemplate[] = [
  {
    id: 'roulette-event',
    type: 'roulette',
    name: 'Ruleta de premios para evento',
    description: 'Ideal para activaciones con premios, stock y participantes.',
    createConfig: rouletteEventConfig,
  },
  {
    id: 'roulette-local-promo',
    type: 'roulette',
    name: 'Ruleta promocional para local',
    description: 'Una base simple para descuentos, regalos y promociones.',
    createConfig: rouletteLocalConfig,
  },
  {
    id: 'roulette-brand-activation',
    type: 'roulette',
    name: 'Sorteo / activación de marca',
    description: 'Valores neutros para una activación de marca editable.',
    createConfig: rouletteBrandActivationConfig,
  },
  {
    id: 'catalog-commercial',
    type: PRODUCT_CATALOG_TYPE,
    name: 'Catálogo comercial',
    description: 'Presentación inicial para mostrar productos y disponibilidad.',
    createConfig: catalogCommercialConfig,
  },
];

export function listExperienceTemplates(type?: unknown) {
  return experienceTemplates
    .filter((template) => type === undefined || template.type === type)
    .map(({ id, type: templateType, name, description }) => ({ id, type: templateType, name, description }));
}

export function resolveExperienceTemplate(type: unknown, id: unknown) {
  if (typeof type !== 'string' || typeof id !== 'string') return null;
  return experienceTemplates.find((template) => template.type === type && template.id === id) ?? null;
}

export function createExperienceTemplateDraft(template: ExperienceTemplate, segmentCount?: number) {
  const config = template.createConfig();
  if (template.type !== 'roulette' || !segmentCount || !config || typeof config !== 'object' || Array.isArray(config)) return config;
  const roulette = config as DraftConfig;
  const segments = roulette.segments.slice(0, segmentCount);
  while (segments.length < segmentCount) {
    const index = segments.length;
    segments.push({
      id: `segment-${index + 1}`,
      color: rouletteColors[index % rouletteColors.length]!,
      prizeId: roulette.prizes[index % roulette.prizes.length]?.id ?? null,
    });
  }
  return { ...roulette, segments };
}
