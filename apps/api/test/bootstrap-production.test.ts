// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { existsSync } from 'node:fs';
import { buildBootstrapSql, executeBootstrapSql, validateBootstrapSql } from '../../../scripts/bootstrap-production';
import { describe, expect, it, vi } from 'vitest';

describe('bootstrap production SQL file execution', () => {
  it('genera los ocho INSERTs sin exponer valores fuera del SQL', () => {
    const sql = buildBootstrapSql({ adminEmail: 'admin@example.com', adminHash: 'admin-hash', cosquinEmail: 'cosquin@example.com', cosquinHash: 'cosquin-hash' });
    expect(sql.match(/INSERT INTO /g)).toHaveLength(8);
    expect(sql).toContain('admin-hash');
    expect(() => validateBootstrapSql(sql)).not.toThrow();
  });

  it('usa --file y --remote, y elimina el temporal incluso si falla', async () => {
    let command = '';
    const runner = vi.fn((value: string) => { command = value; throw new Error('runner failure'); });
    const promise = executeBootstrapSql('INSERT INTO a VALUES (1);\n'.repeat(8), runner);
    await expect(promise).rejects.toThrow('runner failure');
    expect(command).toContain('pnpm --filter @corsteno/api exec wrangler');
    expect(command).toContain('--remote');
    expect(command).toContain('--file');
    const tempPath = JSON.parse(command.slice(command.indexOf('--file') + 7));
    expect(existsSync(tempPath)).toBe(false);
  });
});
