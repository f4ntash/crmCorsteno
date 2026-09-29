import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyPublicExperienceUrl } from '../../shared/publication/PublicExperienceActions';
import { generateExperienceQr } from '../../shared/publication/experienceQr';
import { TreasureHuntPublicExperience } from './TreasureHuntPublicExperience';
import { getTreasureHuntPublicUrl } from './publicExperienceUrl';

const publicUrl = 'https://corsteno.com/h/hunter-e2e-qa';

afterEach(() => vi.restoreAllMocks());

describe('Treasure Hunt public experience URL', () => {
  it('builds the canonical URL for a valid slug with the supported hyphen and number characters', () => {
    expect(getTreasureHuntPublicUrl('hunter-e2e-qa')).toBe(publicUrl);
    expect(getTreasureHuntPublicUrl('hunter-e2e-qa-2026')).toBe('https://corsteno.com/h/hunter-e2e-qa-2026');
  });

  it('shows the public link, open, copy and QR actions for a published release', () => {
    const html = renderToStaticMarkup(<TreasureHuntPublicExperience slug="hunter-e2e-qa" published />);

    expect(html).toContain(publicUrl);
    expect(html).toContain('href="https://corsteno.com/h/hunter-e2e-qa"');
    expect(html).toContain('>Abrir</a>');
    expect(html).toContain('Copiar enlace');
    expect(html).toContain('Ver QR');
    expect(html).not.toContain('pages.dev');
  });

  it('does not expose a link or QR before the first release', () => {
    const html = renderToStaticMarkup(<TreasureHuntPublicExperience slug="hunter-e2e-qa" published={false} />);

    expect(html).toContain('Publicá una versión para generar el enlace público.');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('Copiar enlace');
    expect(html).not.toContain('Ver QR');
    expect(html).not.toContain('pages.dev');
  });

  it('copies the same canonical URL shown by the published experience', async () => {
    let copiedUrl = '';
    const writeText = vi.fn(async (value: string) => { copiedUrl = value; });

    await expect(copyPublicExperienceUrl(publicUrl, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(publicUrl);
    expect(copiedUrl).toBe(publicUrl);
  });

  it('passes the canonical URL to the existing QR generator', async () => {
    const calls: Array<{ publicUrl: string; options: { width: number; margin: number } }> = [];
    const toDataURL = vi.fn(async (url: string, options: { width: number; margin: number }) => {
      calls.push({ publicUrl: url, options });
      return 'data:image/png;base64,test';
    });

    await expect(generateExperienceQr(publicUrl, toDataURL)).resolves.toBe('data:image/png;base64,test');
    expect(toDataURL).toHaveBeenCalledWith(publicUrl, { width: 320, margin: 2 });
    expect(calls).toEqual([{ publicUrl, options: { width: 320, margin: 2 } }]);
  });
});
