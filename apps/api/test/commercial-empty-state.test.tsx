import { renderToStaticMarkup } from '../../web/node_modules/react-dom/server';
import React from '../../web/node_modules/react';
import { describe, expect, it } from 'vitest';
import { CommercialPage } from '../../web/src/features/commercial/pages/CommercialPage';

describe('commercial page empty state', () => {
  it('renders a readable empty state instead of a blank catalog', () => {
    const html = renderToStaticMarkup(<CommercialPage org="" />);
    expect(html).toContain('No hay planes comerciales configurados.');
  });
});
