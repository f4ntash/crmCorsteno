/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requireOrganization } from '../src/auth/middleware';

const organization = { id: 'org-b', name: 'B', slug: 'b', role: 'global_admin' };
function appFor(platformRole: string, membership = false) {
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.set('user', { id: 'user-a', email: 'a@example.com', name: 'A', platformRole });
    await next();
  }, requireOrganization);
  app.get('/', (c) => c.json(c.get('organization')));
  const db = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ first: async () => sql.includes('FROM organizations WHERE') || membership ? organization : null }) }) };
  return { app, db };
}

describe('global organization authorization', () => {
  it.each(['super_admin', 'corsteno_admin'])('allows %s to access an organization without membership', async (role) => {
    const { app, db } = appFor(role);
    const response = await app.request('/', { headers: { 'X-Organization-Id': 'org-b' } }, { DB: db });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'org-b', role: 'global_admin' });
  });
  it('denies a normal user without membership', async () => {
    const { app, db } = appFor('user');
    const response = await app.request('/', { headers: { 'X-Organization-Id': 'org-b' } }, { DB: db });
    expect(response.status).toBe(403);
  });
  it('allows a normal user only with an active membership', async () => {
    const { app, db } = appFor('user', true);
    const response = await app.request('/', { headers: { 'X-Organization-Id': 'org-b' } }, { DB: db });
    expect(response.status).toBe(200);
  });
});
