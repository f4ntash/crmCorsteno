import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('local platform admin seed guard', () => {
  it('is explicitly local-only and does not contain a remote execution flag', async () => {
    const source = await readFile(resolve(process.cwd(), '../../scripts/seed-local-platform-admin.ts'), 'utf8');
    expect(source).toContain('LOCAL DEVELOPMENT ONLY — NEVER USE IN PRODUCTION');
    expect(source).toContain("'super_admin'");
    expect(source).toContain('Corsteno Local');
    expect(source).toContain('--local');
    expect(source).toContain("process.argv.includes('--remote')");
    expect(source).not.toContain('user@user.com');
    expect(source).not.toContain('Cliente Demo Corsteno');
  });
});
