import { describe, expect, it } from 'vitest';
import { formatActivity } from '../../web/src/features/activity/presentation';

const item = (action: string, resourceType: string, metadata: Record<string, unknown> = {}) => ({ action, resourceType, metadata, actorName: 'Matu', actorEmail: 'matu@example.com' });

describe('customer-facing activity presentation', () => {
  it('maps catalog resources and actions without exposing technical identifiers', () => {
    expect(formatActivity(item('catalog.product.created', 'catalog_product', { name: 'Café' }))).toBe('Matu creó el producto Café');
    expect(formatActivity(item('catalog.gallery.updated', 'catalog_product', { operation: 'reordered' }))).toContain('orden de las imágenes');
    expect(formatActivity(item('unknown.action', 'catalog_product'))).not.toContain('catalog_product');
  });

  it('keeps raw IDs out of customer-facing fallback text', () => {
    expect(formatActivity(item('unknown.action', 'internal_resource', { id: 'secret-id' }))).toBe('Matu registró una acción en un recurso del espacio');
  });
});
