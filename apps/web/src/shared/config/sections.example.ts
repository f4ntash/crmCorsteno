import type { ConfigSectionDefinition } from './sections';

// Test/demo data only: an unrelated module can declare flat sections without Roulette dependencies.
export const unrelatedConfigurationSections: ConfigSectionDefinition[] = [
  {
    id: 'general',
    title: 'General',
    description: 'Información básica.',
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 120 },
      { key: 'description', type: 'textarea', label: 'Description', maxLength: 500 },
      { key: 'visible', type: 'boolean', label: 'Visible' },
    ],
  },
  {
    id: 'commercial',
    title: 'Commercial',
    fields: [
      { key: 'price', type: 'number', label: 'Price', min: 0, step: 0.01 },
      { key: 'featured', type: 'boolean', label: 'Featured' },
    ],
  },
  {
    id: 'media',
    title: 'Media',
    fields: [{ key: 'image', type: 'asset', label: 'Image', categories: ['product_image', 'image'] }],
  },
];
