import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('local platform admin seed guard', () => {
  it('is explicitly local-only and does not contain a remote execution flag', async () => {
    const source = await readFile(new URL('../../../scripts/seed-local-platform-admin.ts', import.meta.url), 'utf8');
    expect(source).toContain('LOCAL DEVELOPMENT ONLY — NEVER USE IN PRODUCTION');
    expect(source).toContain('--local --file');
    expect(source).toContain("arg.includes('--remote')");
    expect(source).not.toContain("'--remote', '--file'");
  });
});
