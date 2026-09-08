import type { RouletteConfig } from './types';

export type RouletteTemplate = {
  id: string;
  name: string;
  description: string;
  config: RouletteConfig;
};

function config(
  backgroundColor: string,
  prizes: RouletteConfig['prizes'],
  colors: string[],
): RouletteConfig {
  return {
    schemaVersion: 1,
    backgroundColor,
    prizes,
    segments: colors.map((color, index) => ({
      id: `segment-${index + 1}`,
      color,
      prizeId: prizes[index % prizes.length]?.id ?? null,
    })),
    effects: { sound: true, vibration: true, celebration: true },
    participation: {
      maxSpinsPerDevice: null,
      maxSpinsPerSession: null,
      cooldownSeconds: 0,
    },
  };
}

export const rouletteTemplates: RouletteTemplate[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Una base limpia para empezar rápido.',
    config: config(
      '#111111',
      [
        {
          id: 'prize-1',
          name: 'Premio 1',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
        {
          id: 'prize-2',
          name: 'Premio 2',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
      ],
      ['#D6B25E', '#262626', '#79A7D3', '#262626', '#9BC47D', '#262626'],
    ),
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Sobria, clara y adaptable a una marca.',
    config: config(
      '#F4F1EA',
      [
        {
          id: 'prize-1',
          name: 'Beneficio especial',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
        {
          id: 'prize-2',
          name: 'Gracias por participar',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
      ],
      ['#16324F', '#E7B84B', '#2C6E9E', '#F0D58A', '#16324F', '#2C6E9E'],
    ),
  },
  {
    id: 'festival',
    name: 'Festival',
    description: 'Energética y colorida para activaciones en vivo.',
    config: config(
      '#21102F',
      [
        {
          id: 'prize-1',
          name: 'Entrada sorpresa',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
        {
          id: 'prize-2',
          name: 'Merch oficial',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
        {
          id: 'prize-3',
          name: 'Sin premio',
          enabled: true,
          weight: 2,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
      ],
      [
        '#F05A47',
        '#F6C445',
        '#4EC5A5',
        '#8B6CCB',
        '#F05A47',
        '#4EC5A5',
        '#F6C445',
        '#8B6CCB',
      ],
    ),
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Contraste elegante para una experiencia de marca.',
    config: config(
      '#0B0D12',
      [
        {
          id: 'prize-1',
          name: 'Experiencia premium',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
        {
          id: 'prize-2',
          name: 'Regalo exclusivo',
          enabled: true,
          weight: 1,
          stockMode: 'unlimited',
          redemption: { enabled: false },
        },
      ],
      ['#C9A75D', '#202733', '#E8D39A', '#364354', '#C9A75D', '#202733'],
    ),
  },
];
