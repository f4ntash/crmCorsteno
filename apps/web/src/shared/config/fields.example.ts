import type { ConfigFieldDefinition } from './fields';

// Test/demo definition only: future modules can describe their own fields without importing Roulette code.
export const unrelatedProductFields: ConfigFieldDefinition[] = [
  { key: 'name', type: 'text', label: 'Name', required: true, maxLength: 120 },
  { key: 'description', type: 'textarea', label: 'Description', maxLength: 500 },
  { key: 'price', type: 'number', label: 'Price', min: 0, step: 0.01 },
  { key: 'visible', type: 'boolean', label: 'Visible' },
  { key: 'image', type: 'asset', label: 'Image', categories: ['product_image', 'image'] },
];
