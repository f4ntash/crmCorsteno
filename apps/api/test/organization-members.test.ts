/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

function fixture(role = 'admin', targetRole = 'member', admins = 2) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const DB: any = { prepare(sql: string) { return { bind(...args: unknown[]) { const statement: any = { __sql: sql, __args: args }; statement.first = async () => {
    if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: 'user', expires_at: Date.now() + 60000 };
    if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-b' ? null : { id: 'org-a', name: 'Org A', slug: 'org-a', role };
    if (sql.includes('FROM memberships') && sql.includes('user_id=?')) return { role: targetRole, status: 'active' };
    if (sql.includes('COUNT(*) count')) return { count: admins };
    if (sql.includes('FROM users WHERE')) return null;
    return null;
  }; statement.all = async () => ({ results: [{ id: 'actor', name: 'Actor', email: 'actor@test.local', role: 'admin', status: 'active' }, { id: 'other', name: 'Other', email: 'other@test.local', role: 'member', status: 'inactive' }] }); statement.run = async () => ({ meta: { changes: 1 } }); statements.push({ sql, args }); return statement; } }; }, async batch(items: any[]) { statements.push(...items.map((item) => ({ sql: item.__sql, args: item.__args }))); return []; } };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', statements };
}
function request(path: string, env: any, init: RequestInit = {}) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env); }

describe('organization member management', () => {
  it('lists only the current organization members for an authorized organization context', async () => { const response = await request('/organizations/members', fixture()); expect(response.status).toBe(200); expect((await response.json() as any).items).toHaveLength(2); });
  it('creates a member through the existing initial-password account flow', async () => { const env = fixture(); const response = await request('/organizations/members', env, { method: 'POST', body: JSON.stringify({ email: 'new@test.local', name: 'New User', password: 'password', role: 'member' }) }); expect(response.status).toBe(201); expect((await response.json() as any).password).toBeUndefined(); expect(env.statements.some((item) => item.sql.includes('password_hash') && !item.args.includes('password'))).toBe(true); });
  it('rejects admin privilege escalation and protects the last administrator', async () => { expect((await request('/organizations/members/other', fixture('admin'), { method: 'PATCH', body: JSON.stringify({ role: 'owner' }) })).status).toBe(403); expect((await request('/organizations/members/other', fixture('admin', 'admin', 1), { method: 'PATCH', body: JSON.stringify({ role: 'member' }) })).status).toBe(409); });
  it('revokes membership without deleting the user', async () => { const env = fixture(); const response = await request('/organizations/members/other', env, { method: 'DELETE' }); expect(response.status).toBe(200); expect(env.statements.some((item) => item.sql.includes('UPDATE memberships SET status'))).toBe(true); expect(env.statements.some((item) => item.sql.includes('DELETE FROM users'))).toBe(false); });
  it('denies team management to a member and prevents cross-organization context', async () => { expect((await request('/organizations/members/other', fixture('member'), { method: 'DELETE' })).status).toBe(403); const env = fixture(); const response = await request('/organizations/members', env, { headers: { 'X-Organization-Id': 'org-b' } }); expect(response.status).toBe(403); });
});
