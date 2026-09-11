import { describe, expect, it } from 'vitest';
import {
  catalogAssociationsChanged,
  firstClassProductsAvailable,
  organizationProductFromRow,
  parsePublishedProduct,
  productIssues,
} from '../src/services/organization-products';

const product = {
  name: 'Lámpara Nido',
  description: 'Pantalla textil',
  priceMinorUnits: 18900000,
  currency: 'ARS',
  stock: 12,
  visible: true,
  mainAssetUrl: null,
  ctaLabel: 'Consultar',
  ctaUrl: 'https://example.com/nido',
};

function row(publishedContent: string | null = JSON.stringify(product)) {
  return {
    id: 'product-1',
    organizationId: 'org-a',
    productKey: 'lumbre-norte-product-1',
    ...product,
    status: 'active',
    publishedContent,
    publishedAt: 100,
    createdAt: 1,
    updatedAt: 2,
    archivedAt: null,
  };
}

function image(assetId: string, sortOrder = 0) {
  return { id: `image-${assetId}`, organizationId: 'org-a', productId: 'product-1', assetId, url: `/assets/${assetId}`, sortOrder, createdAt: 1 };
}

function stateDb(current: { count: number; updatedAt: number | null } | null, published: { count: number; publishedAt: number | null } | null) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              return (sql.includes('FROM catalog_experience_products ') ? current : published) as T;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('organization products', () => {
  it('parses published snapshots and exposes draft changes without leaking technical identity', () => {
    expect(parsePublishedProduct(JSON.stringify(product))).toEqual(product);
    expect(parsePublishedProduct('{invalid')).toBeNull();

    const clean = organizationProductFromRow(row(), [image('gallery-1')]);
    expect(clean).toEqual(expect.objectContaining({ id: 'product-1', productKey: 'lumbre-norte-product-1', published: true, hasUnpublishedChanges: false }));

    const changed = organizationProductFromRow(row(JSON.stringify({ ...product, priceMinorUnits: 19000000 })), [image('gallery-1')]);
    expect(changed).toEqual(expect.objectContaining({ published: true, hasUnpublishedChanges: true }));

    const publishedGallery = organizationProductFromRow(row(JSON.stringify({ ...product, gallery: [{ assetId: 'gallery-1', sortOrder: 0 }] })), [image('gallery-1')]);
    expect(publishedGallery.hasUnpublishedChanges).toBe(false);
    expect(organizationProductFromRow(row(null)).published).toBe(false);
  });

  it('keeps product validation shared with the existing catalog editor', async () => {
    await expect(productIssues(product)).resolves.toEqual([]);
    await expect(productIssues({ ...product, name: ' ', stock: -1, ctaUrl: 'javascript:alert(1)' })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PRODUCT_NAME_INVALID' }),
      expect.objectContaining({ code: 'PRODUCT_STOCK_INVALID' }),
      expect.objectContaining({ code: 'PRODUCT_CTA_URL_INVALID' }),
    ]));
  });

  it('detects canonical schema availability and structural changes including removing every association', async () => {
    const available = {
      prepare() {
        return { bind() { return { first: async () => ({ value: 1 }) }; } };
      },
    } as unknown as D1Database;
    await expect(firstClassProductsAvailable(available)).resolves.toBe(true);
    await expect(catalogAssociationsChanged(stateDb({ count: 2, updatedAt: 20 }, { count: 2, publishedAt: 10 }), 'experience-1', 'org-a')).resolves.toBe(true);
    await expect(catalogAssociationsChanged(stateDb({ count: 0, updatedAt: null }, { count: 2, publishedAt: 10 }), 'experience-1', 'org-a')).resolves.toBe(true);
    await expect(catalogAssociationsChanged(stateDb({ count: 2, updatedAt: 5 }, { count: 2, publishedAt: 10 }), 'experience-1', 'org-a')).resolves.toBe(false);
  });
});
