/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type Membership = { organizationId: string; organizationName: string; organizationSlug: string; ownerEmail?: string; role: string };

function fixture(options: { platformRole?: string; memberships?: Membership[]; organizations?: Membership[] } = {}) {
  const platformRole = options.platformRole ?? 'user';
  const memberships = options.memberships ?? [];
  const organizations = options.organizations ?? memberships;
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          void args;
          return {
            first: async () => sql.includes('auth_sessions')
              ? { session_id: 'session', id: 'user-1', email: 'customer@example.com', name: 'Customer', platformRole, expires_at: Date.now() + 60_000 }
              : null,
            all: async () => ({ results: sql.includes('FROM organizations o WHERE') ? organizations : memberships }),
            run: async () => ({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

function request(env: any) {
  return app.fetch(new Request('http://localhost/auth/me', { headers: { Cookie: 'corsteno_session=session' } }), env);
}

describe('customer authentication organization context', () => {
  it('returns the single active organization with its existing permissions', async () => {
    const response = await request(fixture({ memberships: [{ organizationId: 'org-a', organizationName: 'Org A', organizationSlug: 'org-a', role: 'admin' }] }));
    expect(response.status).toBe(200);
    const body = await response.json() as { memberships: Array<{ organizationId: string; role: string; permissions: string[] }> };
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]).toMatchObject({ organizationId: 'org-a', role: 'admin' });
    expect(body.memberships[0]?.permissions).toEqual(expect.arrayContaining(['crm.read', 'crm.manage', 'analytics.read']));
  });

  it('returns only the active organizations available to a multi-organization customer', async () => {
    const response = await request(fixture({ memberships: [
      { organizationId: 'org-a', organizationName: 'Org A', organizationSlug: 'org-a', role: 'member' },
      { organizationId: 'org-b', organizationName: 'Org B', organizationSlug: 'org-b', role: 'viewer' },
    ] }));
    expect(response.status).toBe(200);
    expect((await response.json() as { memberships: Membership[] }).memberships.map((item) => item.organizationId)).toEqual(['org-a', 'org-b']);
  });

  it('returns an authenticated no-membership state instead of inventing organization access', async () => {
    const response = await request(fixture());
    expect(response.status).toBe(200);
    expect((await response.json() as { memberships: unknown[] }).memberships).toEqual([]);
  });

  it('keeps platform admins able to switch across active organizations', async () => {
    const response = await request(fixture({ platformRole: 'corsteno_admin', organizations: [
      { organizationId: 'org-a', organizationName: 'Org A', organizationSlug: 'org-a', role: 'global_admin' },
      { organizationId: 'org-b', organizationName: 'Org B', organizationSlug: 'org-b', role: 'global_admin' },
    ] }));
    expect(response.status).toBe(200);
    const body = await response.json() as { memberships: Array<{ organizationId: string; role: string; permissions: string[] }> };
    expect(body.memberships.map((item) => item.organizationId)).toEqual(['org-a', 'org-b']);
    expect(body.memberships[0]?.permissions).toHaveLength(7);
  });

  it('includes owner email for platform workspace labels while keeping organization as the selector value', async () => {
    const response = await request(fixture({ platformRole: 'super_admin', organizations: [
      { organizationId: 'org-a', organizationName: 'Muebles Demo', organizationSlug: 'muebles-demo', ownerEmail: 'owner@example.com', role: 'global_admin' },
    ] }));
    const body = await response.json() as { memberships: Array<{ organizationId: string; organizationName: string; ownerEmail?: string }> };
    expect(body.memberships).toEqual([expect.objectContaining({ organizationId: 'org-a', organizationName: 'Muebles Demo', ownerEmail: 'owner@example.com' })]);
  });
});
