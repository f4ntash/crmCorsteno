import { describe, expect, it } from 'vitest';
import { buildResetSql } from '../../../scripts/reset-production-admin';

describe('production admin password reset', () => {
  it('targets only an existing administrator and invalidates their sessions', () => {
    const sql = buildResetSql('Admin@Example.com', 'hash-not-a-password');
    expect(sql).toContain("email_normalized='admin@example.com'");
    expect(sql).toContain("platform_role IN ('super_admin','corsteno_admin')");
    expect(sql).toContain("role IN ('owner','admin')");
    expect(sql).toContain('DELETE FROM auth_sessions');
    expect(sql).not.toContain('INSERT INTO users');
    expect(sql).not.toContain('UPDATE memberships');
    expect(sql).not.toContain('UPDATE organizations');
  });
});
