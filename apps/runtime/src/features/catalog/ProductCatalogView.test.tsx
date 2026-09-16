import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CatalogPublicProduct } from '../../api/publicExperiencesApi';
import { SURFACE_MATERIAL_SCHEMA_VERSION, type SurfaceMaterialConfig } from '@corsteno/types';
import { ProductCatalogView } from './ProductCatalogView';

const baseProduct: CatalogPublicProduct = {
  id: 'furniture-product-id',
  name: 'Mesa de comedor',
  description: 'Roble macizo.',
  priceMinorUnits: 18_900_000,
  currency: 'ARS',
  stock: 8,
  mainImageUrl: null,
  gallery: [],
  ctaLabel: 'Consultar disponibilidad',
  ctaUrl: 'https://example.com/mesa',
};

function markup(product: CatalogPublicProduct) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProductCatalogView, { config: { schemaVersion: 1, title: 'Catálogo' }, products: [product], slug: 'catalogo' })));
}

const surfaceConfig: SurfaceMaterialConfig = {
  schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION,
  enabled: true,
  mode: 'texture',
  physicalWidthM: 1,
  physicalHeightM: 1,
  roughness: 0.8,
  metalness: 0,
  rotationDegrees: 0,
  repeatMode: 'repeat',
  fallbackColor: '#999999',
  assets: { baseColorTexture: '/assets/base.webp' },
};

describe('ProductCatalogView', () => {
  it('keeps legacy products without a price unit and retains the accessible image fallback', () => {
    const html = markup(baseProduct);
    expect(html).toContain('catalog-product-price');
    expect(html).not.toContain('/ unidad');
    expect(html).toContain('aria-label="Imagen no disponible para Mesa de comedor"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it('renders a generic unit and a concise material and finish summary for surfaced products', () => {
    const html = markup({ ...baseProduct, name: 'Listón Roble Natural', priceMinorUnits: 3_890_000, priceUnit: 'm²', metadata: { material: 'Madera', finish: 'Mate', environment: 'Interior' } });
    expect(html).toContain('ARS');
    expect(html).toContain('/ m²');
    expect(html).toContain('Madera · mate');
  });

  it('shows the visualizer only for a product with valid surface capability', () => {
    const furniture = markup(baseProduct);
    const revestimiento = markup({ ...baseProduct, id: '00000000-0000-4000-8000-000000000111', surfaceConfig });
    expect(furniture).not.toContain('Ver en ambiente');
    expect(revestimiento).toContain('Ver en ambiente');
    expect(revestimiento).toContain('/r/catalogo/visualizer/00000000-0000-4000-8000-000000000111');
  });
});
