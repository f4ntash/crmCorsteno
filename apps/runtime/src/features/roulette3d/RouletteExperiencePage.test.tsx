import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RouletteExperiencePage } from './RouletteExperiencePage';

describe('RouletteExperiencePage', () => {
  it('uses the same runtime frame and toolbar slot for preview and published roulette', () => {
    const roulette = createElement('div', { className: 'roulette-view' });
    const published = renderToStaticMarkup(createElement(RouletteExperiencePage, { children: roulette }));
    const preview = renderToStaticMarkup(createElement(RouletteExperiencePage, { returnToEditor: '/app/experiences/demo', children: roulette }));

    expect(published).toContain('<main><div class="roulette-page-toolbar">');
    expect(preview).toContain('<main><div class="roulette-page-toolbar">');
    expect(published).toContain('<span class="roulette-page-toolbar-spacer" aria-hidden="true"></span>');
    const editorLink = '<a class="secondary-cta roulette-preview-return" href="/app/experiences/demo">← Volver al editor</a>';
    expect(preview).toContain(editorLink);
    expect(published.replace('<span class="roulette-page-toolbar-spacer" aria-hidden="true"></span>', editorLink)).toBe(preview);
    expect(published.match(/class="roulette-view"/g)).toHaveLength(1);
    expect(preview.match(/class="roulette-view"/g)).toHaveLength(1);
  });
});
