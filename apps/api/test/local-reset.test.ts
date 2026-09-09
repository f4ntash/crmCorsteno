import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('local database reset safety', () => {
  it('uses local Wrangler state and guards production/remote execution', async () => {
    const source = await readFile(resolve(process.cwd(), '../../scripts/reset-local-db.ts'), 'utf8');
    expect(source).toContain("'--local'");
    expect(source).toContain("environment === 'production'");
    expect(source).toContain("cloudflareEnvironment === 'production'");
    expect(source).toContain("process.argv.includes('--remote')");
    expect(source).toContain('DELETE FROM d1_migrations');
    expect(source).not.toContain('--remote`');
  });
});
