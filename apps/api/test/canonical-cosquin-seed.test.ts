import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seedScript = readFileSync(
  new URL('../../../scripts/seed-canonical-production.ts', import.meta.url),
  'utf8',
);

describe('canonical Cosquín production seed', () => {
  it('links the published AR experience to its active canonical public site', () => {
    expect(seedScript).toContain('INSERT OR IGNORE INTO experience_channels');
    expect(seedScript).toContain("'00000000-0000-4000-8000-000000000311'");
    expect(seedScript).toContain('ids.cosquinExperience');
    expect(seedScript).toContain("uuid('000000000000', 301)");
    expect(seedScript).toContain("c.type='external_site' AND c.status='active' AND c.url='https://cosquinrock.corsteno.com/'");
  });
});
