/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

function fixture(platformRole = 'super_admin') {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const DB: any = {
    prepare(sql: string) {
      return { bind(...args: unknown[]) { const statement: any = { __sql: sql, __args: args, first: async () => sql.includes('auth_sessions') ? { session_id: 's', id: 'u', email: 'admin@admin.com', name: 'Admin', platformRole, expires_at: Date.now() + 60_000 } : null, run: async () => ({ meta: { changes: 1 } }) }; statements.push({ sql, args }); return statement; } };
    },
    async batch(items: any[]) { statements.push(...items.map((item) => ({ sql: item.__sql ?? '', args: item.__args ?? [] }))); return []; },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', statements };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('client onboarding organization endpoint', () => {
  it('creates an organization and its initial project for platform admins', async () => {
    const env = fixture();
    const response = await request('/admin/organizations', env, { method: 'POST', body: JSON.stringify({ name: 'Cliente Ñ Demo' }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(expect.objectContaining({ name: 'Cliente Ñ Demo', projectId: expect.any(String) }));
    expect(env.statements.map((item) => item.sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO organizations'),
      expect.stringContaining('INSERT INTO projects'),
    ]));
  });

  it('rejects normal organization users and invalid names', async () => {
    expect((await request('/admin/organizations', fixture('user'), { method: 'POST', body: JSON.stringify({ name: 'Cliente' }) })).status).toBe(403);
    expect((await request('/admin/organizations', fixture(), { method: 'POST', body: JSON.stringify({ name: 'x' }) })).status).toBe(400);
  });
});
