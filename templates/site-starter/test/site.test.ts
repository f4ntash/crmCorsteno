import { describe, expect, it } from 'vitest';
import { CorstenoApiError } from '@corsteno/client';
import { shouldRenderPromotion } from '../src/utils/content';
import { isNotFoundError } from '../src/utils/api';
import { preferredMedia } from '../src/utils/media';
import { formatPrice } from '../src/utils/price';
import { stockLabel } from '../src/utils/stock';
import { normalizeInternalPath, isExternalUrl } from '../src/utils/urls';

describe('standalone site presentation rules', () => {
  it('keeps disabled promotion content out of the page', () => {
    expect(shouldRenderPromotion({ enabled: false, title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' })).toBe(false);
    expect(shouldRenderPromotion({ enabled: true, title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' })).toBe(true);
  });

  it('formats public prices from integer minor units and keeps currency explicit', () => {
    expect(formatPrice(18900000, 'ARS')).toContain('189,000.00');
    expect(formatPrice(1000, 'USD')).toContain('10.00');
    expect(formatPrice(-1, 'ARS')).toBe('Precio no disponible');
  });

  it('uses public stock semantics without guessing a low-stock threshold', () => {
    expect(stockLabel(10)).toBe('Disponible');
    expect(stockLabel(1)).toBe('Disponible');
    expect(stockLabel(0)).toBe('Agotado');
  });

  it('prefers available published 3D and otherwise uses image media', () => {
    expect(preferredMedia({ available: false })).toBe('image');
    expect(preferredMedia({ available: true, modelUrl: 'https://api.example/model.glb', transform: { scale: 1, position: { x: 0, y: 0, z: 0 }, rotationDegrees: { x: 0, y: 0, z: 0 } }, viewer: { framing: 'auto' }, arEnabled: false })).toBe('3d');
  });

  it('distinguishes public not-found errors from recoverable API errors', () => {
    expect(isNotFoundError(new CorstenoApiError('missing', { kind: 'not_found', status: 404 }))).toBe(true);
    expect(isNotFoundError(new CorstenoApiError('offline', { kind: 'network', status: 0 }))).toBe(false);
  });

  it('keeps relative CTA links inside the SPA and external CTAs explicit', () => {
    expect(normalizeInternalPath('/productos')).toBe('/productos');
    expect(normalizeInternalPath('productos')).toBe('/productos');
    expect(isExternalUrl('https://example.com/shop')).toBe(true);
    expect(isExternalUrl('/productos')).toBe(false);
  });
});
