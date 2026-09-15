/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

function fixture(platformRole = 'super_admin', existingEmail = false) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; args: unknown[] }>> = [];
  let provisionedEmail = existingEmail;
  const DB: any = {
    prepare(sql: string) {
      return { bind(...args: unknown[]) { const statement: any = { __sql: sql, __args: args, first: async () => sql.includes('auth_sessions') ? { session_id: 's', id: 'u', email: 'admin@admin.com', name: 'Admin', platformRole, expires_at: Date.now() + 60_000 } : sql.includes('FROM organizations WHERE') ? { id: 'org-x' } : sql.includes('FROM users WHERE email_normalized') && provisionedEmail ? { id: 'existing-user' } : null, run: async () => ({ meta: { changes: 1 } }) }; statements.push({ sql, args }); return statement; } };
    },
    async batch(items: any[]) { const batch = items.map((item) => ({ sql: item.__sql ?? '', args: item.__args ?? [] })); batches.push(batch); statements.push(...batch); provisionedEmail = true; return []; },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', statements, batches };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('client onboarding organization endpoint', () => {
  it('creates organization, initial project, normalized owner and membership in one batch', async () => {
    const env = fixture();
    const response = await request('/admin/onboarding', env, { method: 'POST', body: JSON.stringify({ organizationName: 'Cliente Ñ Demo', email: ' Owner@Example.com ', name: 'Owner Name', password: 'password' }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'Cliente Ñ Demo', owner: { email: 'owner@example.com', name: 'Owner Name' } });
    expect(env.statements.map((item) => item.sql)).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO organizations'), expect.stringContaining('INSERT INTO projects'),
      expect.stringContaining('INSERT INTO users'), expect.stringContaining('INSERT INTO memberships'),
    ]));
    expect(env.statements.find((item) => item.sql.includes('INSERT INTO users'))?.args).toContain('owner@example.com');
    expect(env.batches[0]?.map((item) => item.sql)).toHaveLength(4);
    expect(env.statements.some((item) => /subscriptions|activations|experiences/i.test(item.sql))).toBe(false);
    expect(env.statements.find((item) => item.sql.includes('INSERT INTO users'))?.args).not.toContain('password');
  });

  it('rejects a duplicate owner email before provisioning any onboarding rows', async () => {
    const env = fixture('super_admin', true);
    const response = await request('/admin/onboarding', env, { method: 'POST', body: JSON.stringify({ organizationName: 'Cliente', email: 'owner@example.com', name: 'Owner', password: 'password' }) });
    expect(response.status).toBe(409);
    expect(env.statements.some((item) => item.sql.startsWith('INSERT INTO'))).toBe(false);
  });

  it('validates the normalized owner email before the wizard advances', async () => {
    const available = await request('/admin/onboarding/email-check', fixture(), { method: 'POST', body: JSON.stringify({ email: ' Owner@Example.com ' }) });
    expect(available.status).toBe(200);
    expect(await available.json()).toEqual({ available: true });
    const duplicate = await request('/admin/onboarding/email-check', fixture('super_admin', true), { method: 'POST', body: JSON.stringify({ email: ' OWNER@example.com ' }) });
    expect(duplicate.status).toBe(409);
  });

  it('allows only one provisioning when the same owner email is submitted twice', async () => {
    const env = fixture();
    const body = JSON.stringify({ organizationName: 'Cliente', email: 'owner@example.com', name: 'Owner', password: 'password' });
    expect((await request('/admin/onboarding', env, { method: 'POST', body })).status).toBe(201);
    expect((await request('/admin/onboarding', env, { method: 'POST', body })).status).toBe(409);
    expect(env.batches).toHaveLength(1);
  });

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
  it('provisions a normal customer with a hashed password and membership', async () => {
    const env = fixture();
    const response = await request('/admin/users', env, { method: 'POST', body: JSON.stringify({ organizationId: 'org-x', email: 'customer@test.local', name: 'Customer', password: 'password', role: 'admin' }) });
    expect(response.status).toBe(201);
    expect(env.statements.some((item) => item.sql.includes('password_hash') && !item.args.includes('password'))).toBe(true);
    expect(env.statements.some((item) => item.sql.includes('INSERT INTO memberships'))).toBe(true);
  });
});
