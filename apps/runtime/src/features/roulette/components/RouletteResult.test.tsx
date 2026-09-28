import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SpinResult } from '../../../api/publicExperiencesApi';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import { RouletteResult } from './RouletteResult';

const config = {
  schemaVersion: 1,
  backgroundColor: '#172331',
  content: { winMessage: '¡GANASTE!', noPrizeMessage: 'Esta vez no hubo premio.' },
  prizes: [{ id: 'prize-1', name: '10% de descuento', iconUrl: '/prize.png' }],
  segments: [{ id: 'segment-1', color: '#D6B25E', prizeId: 'prize-1' }],
  resultCta: { enabled: true, label: 'Ver beneficio', url: 'https://example.com' },
} as unknown as Roulette3DConfig;

describe('RouletteResult', () => {
  it('renders the WIN copy, prize, claim, and CTA structure', () => {
    const result: SpinResult = {
      spinId: 'spin-win',
      segmentIndex: 0,
      segment: { id: 'segment-1', prizeId: 'prize-1' },
      prize: { id: 'prize-1', name: '10% de descuento', iconUrl: '/prize.png' },
      claim: { code: 'A1B2C3D4', status: 'active' },
    };
    const markup = renderToStaticMarkup(createElement(RouletteResult, { result, config, onCta: () => undefined }));

    expect(markup).toContain('roulette-result-card is-win');
    expect(markup).toContain('¡GANASTE!');
    expect(markup).toContain('src="/prize.png"');
    expect(markup).toContain('<h2>10% de descuento</h2>');
    expect(markup).toContain('A1B2C3D4');
    expect(markup).toContain('Ver beneficio');
  });

  it('keeps the prize name visible when a WIN has no image', () => {
    const result: SpinResult = {
      spinId: 'spin-win-without-image',
      segmentIndex: 0,
      segment: { id: 'segment-1', prizeId: 'prize-1' },
      prize: { id: 'prize-1', name: '10% de descuento', iconUrl: null },
      claim: null,
    };
    const markup = renderToStaticMarkup(createElement(RouletteResult, { result, config, onCta: () => undefined }));

    expect(markup).toContain('<div class="result-prize-fallback">10% de descuento</div>');
    expect(markup).toContain('<h2>10% de descuento</h2>');
  });

  it('keeps NO_PRIZE copy and neutral structure without prize-only content', () => {
    const result: SpinResult = {
      spinId: 'spin-no-prize',
      segmentIndex: 0,
      segment: { id: 'segment-1', prizeId: null },
      prize: null,
      claim: null,
    };
    const markup = renderToStaticMarkup(createElement(RouletteResult, { result, config, onCta: () => undefined }));

    expect(markup).toContain('roulette-result-card is-neutral');
    expect(markup).toContain('Esta vez no hubo premio.');
    expect(markup).not.toContain('<h2>');
    expect(markup).not.toContain('A1B2C3D4');
    expect(markup).not.toContain('src="/prize.png"');
  });
});
