import { describe, expect, it } from 'vitest';
import app from '../src';
import { hashPassword } from '../src/auth/crypto';
import { activeWorkspaceApplications, buildNavigation } from '../../web/src/app/navigation';

type User = { id: string; email: string; name: string; password_hash: string; platform_role: string };
type Membership = { organizationId: string; organizationName: string; organizationSlug: string; role: string; userId: string };

const password = 'integration-only-password';
const organizations = [
  { id: 'org-roulette', name: 'QA Roulette', slug: 'qa-roulette' },
  { id: 'org-catalog', name: 'QA Catalog', slug: 'qa-catalog' },
  { id: 'org-website', name: 'QA Website', slug: 'qa-website' },
  { id: 'org-ar', name: 'QA AR', slug: 'qa-ar' },
  { id: 'org-la-estacion', name: 'La Estación', slug: 'la-estacion' },
];

async function fixture() {
  const users: User[] = [
    { id: 'user-admin', email: 'admin@example.test', name: 'Admin', password_hash: await hashPassword(password), platform_role: 'super_admin' },
    { id: 'user-roulette', email: 'roulette@example.test', name: 'Roulette', password_hash: await hashPassword(password), platform_role: 'user' },
    { id: 'user-catalog', email: 'catalog@example.test', name: 'Catalog', password_hash: await hashPassword(password), platform_role: 'user' },
    { id: 'user-website', email: 'website@example.test', name: 'Website', password_hash: await hashPassword(password), platform_role: 'user' },
    { id: 'user-ar', email: 'ar@example.test', name: 'AR', password_hash: await hashPassword(password), platform_role: 'user' },
    { id: 'user-la-estacion', email: 'la-estacion@example.test', name: 'Demo La Estación', password_hash: await hashPassword(password), platform_role: 'user' },
  ];
  const memberships: Membership[] = [
    { userId: 'user-roulette', organizationId: 'org-roulette', organizationName: 'QA Roulette', organizationSlug: 'qa-roulette', role: 'owner' },
    { userId: 'user-catalog', organizationId: 'org-catalog', organizationName: 'QA Catalog', organizationSlug: 'qa-catalog', role: 'admin' },
    { userId: 'user-website', organizationId: 'org-website', organizationName: 'QA Website', organizationSlug: 'qa-website', role: 'admin' },
    { userId: 'user-ar', organizationId: 'org-ar', organizationName: 'QA AR', organizationSlug: 'qa-ar', role: 'admin' },
    { userId: 'user-la-estacion', organizationId: 'org-la-estacion', organizationName: 'La Estación', organizationSlug: 'la-estacion', role: 'member' },
  ];
  const sessions = new Map<string, { id: string; userId: string; tokenHash: string; expiresAt: number }>();
  const DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            first: async <T>() => {
              if (sql.includes('FROM users WHERE email_normalized')) {
                const email = String(args[0]);
                const user = users.find((candidate) => candidate.email === email);
                return user as T | undefined;
              }
              if (sql.includes('FROM auth_sessions s JOIN users u')) {
                const session = sessions.get(String(args[0]));
                const user = users.find((candidate) => candidate.id === session?.userId);
                return session && user ? { session_id: session.id, expires_at: session.expiresAt, id: user.id, email: user.email, name: user.name, platformRole: user.platform_role } as T : undefined;
              }
              if (sql.includes('JOIN memberships m ON')) {
                const organizationId = String(args[0]);
                const userId = String(args[1]);
                const membership = memberships.find((candidate) => candidate.organizationId === organizationId && candidate.userId === userId);
                const organization = organizations.find((candidate) => candidate.id === organizationId);
                return membership && organization ? { id: organization.id, name: organization.name, slug: organization.slug, role: membership.role } as T : undefined;
              }
              return undefined;
            },
            all: async <T>() => {
              if (sql.includes('FROM organizations o WHERE')) return { results: organizations.map((organization) => ({ ...organization, organizationId: organization.id, organizationName: organization.name, organizationSlug: organization.slug, role: 'global_admin' })) as T[] };
              if (sql.includes('FROM memberships m JOIN organizations o')) {
                return { results: memberships.filter((membership) => membership.userId === String(args[0])).map((membership) => ({ organizationId: membership.organizationId, organizationName: membership.organizationName, organizationSlug: membership.organizationSlug, role: membership.role })) as T[] };
              }
              if (sql.includes('FROM applications WHERE organization_id=?')) {
                return {
                  results: String(args[0]) === 'org-la-estacion'
                    ? [{ id: 'app-la-estacion', organizationId: 'org-la-estacion', projectId: 'project-la-estacion', name: 'TUS ESTACIONES', slug: 'tus-estaciones', status: 'active', applicationType: 'generic' }]
                    : [],
                } as T;
              }
              return { results: [] as T[] };
            },
            run: async () => {
              if (sql.includes('INSERT INTO auth_sessions')) {
                const [id, userId, tokenHash, expiresAt] = args as [string, string, string, number];
                sessions.set(tokenHash, { id, userId, tokenHash, expiresAt });
              }
              if (sql.includes('DELETE FROM auth_sessions WHERE token_hash')) sessions.delete(String(args[0]));
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', LEAD_JOB_QUEUE: { send: async () => undefined } };
}

async function login(env: Awaited<ReturnType<typeof fixture>>, email: string) {
  const response = await app.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'Content-Type': 'application/json' } }, env);
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')?.match(/corsteno_session=[^;]+/)?.[0] ?? '';
}

async function readMe(env: Awaited<ReturnType<typeof fixture>>, cookie: string) {
  return app.fetch(new Request('http://localhost/auth/me', { headers: { Cookie: cookie } }), env);
}

async function logout(env: Awaited<ReturnType<typeof fixture>>, cookie: string) {
  const response = await app.fetch(new Request('http://localhost/auth/logout', { method: 'POST', headers: { Cookie: cookie } }), env);
  expect(response.status).toBe(200);
  expect((await readMe(env, cookie)).status).toBe(401);
}

describe('real-session navigation integration contract', () => {
  it('isolates Admin → Roulette → Catalog logout/login and keeps owner as a normal platform user', async () => {
    const env = await fixture();
    const adminCookie = await login(env, 'admin@example.test');
    const adminMe = await (await readMe(env, adminCookie)).json() as { user: { platformRole: string }; memberships: Array<{ organizationId: string }> };
    expect(adminMe.user.platformRole).toBe('super_admin');
    expect(adminMe.memberships).toHaveLength(5);
    await logout(env, adminCookie);

    const rouletteCookie = await login(env, 'roulette@example.test');
    const rouletteMe = await (await readMe(env, rouletteCookie)).json() as { user: { id: string; platformRole: string }; memberships: Array<{ organizationId: string; role: string; permissions: string[] }> };
    expect(rouletteMe.user).toMatchObject({ id: 'user-roulette', platformRole: 'user' });
    expect(rouletteMe.memberships).toEqual([{ organizationId: 'org-roulette', role: 'owner', organizationName: 'QA Roulette', organizationSlug: 'qa-roulette', permissions: expect.any(Array) }]);
    expect(buildNavigation({ mode: 'workspace', platformRole: rouletteMe.user.platformRole, permissions: rouletteMe.memberships[0]?.permissions ?? [], workspace: true, productTypes: new Set(['roulette']) }).map((item) => item.label)).toEqual(['Inicio', 'Ruleta', 'Resultados', 'Reportes', 'Canjear premio']);
    expect((await app.fetch(new Request('http://localhost/leads', { headers: { Cookie: rouletteCookie } }), env)).status).toBe(403);
    await logout(env, rouletteCookie);

    const catalogCookie = await login(env, 'catalog@example.test');
    const catalogMe = await (await readMe(env, catalogCookie)).json() as { user: { platformRole: string }; memberships: Array<{ organizationId: string; role: string; permissions: string[] }> };
    expect(catalogMe.user.platformRole).toBe('user');
    expect(catalogMe.memberships[0]).toMatchObject({ organizationId: 'org-catalog', role: 'admin' });
    expect(buildNavigation({ mode: 'workspace', platformRole: catalogMe.user.platformRole, permissions: catalogMe.memberships[0]?.permissions ?? [], workspace: true, productTypes: new Set(['product-catalog']) }).map((item) => item.label)).toEqual(['Inicio', 'Catálogo', 'Productos', 'Sitios y canales']);
    await logout(env, catalogCookie);

    const websiteMe = await (await readMe(env, await login(env, 'website@example.test'))).json() as { user: { platformRole: string }; memberships: Array<{ role: string }> };
    expect(websiteMe.user.platformRole).toBe('user');
    expect(websiteMe.memberships[0]?.role).toBe('admin');
    const arMe = await (await readMe(env, await login(env, 'ar@example.test'))).json() as { user: { platformRole: string }; memberships: Array<{ role: string }> };
    expect(arMe.user.platformRole).toBe('user');
    expect(arMe.memberships[0]?.role).toBe('admin');
  });

  it('shows Analytics to a member when /applications returns an active generic application without commercial products', async () => {
    const env = await fixture();
    const cookie = await login(env, 'la-estacion@example.test');
    const meResponse = await readMe(env, cookie);
    expect(meResponse.headers.get('Cache-Control')).toBe('no-store');
    const me = await meResponse.json() as { user: { platformRole: string }; memberships: Array<{ organizationId: string; role: string; permissions: string[] }> };
    expect(me.user.platformRole).toBe('user');
    expect(me.memberships[0]).toMatchObject({ organizationId: 'org-la-estacion', role: 'member' });
    expect(me.memberships[0]?.permissions).toContain('analytics.read');

    const applicationsResponse = await app.fetch(new Request('http://localhost/applications', { headers: { Cookie: cookie, 'X-Organization-Id': 'org-la-estacion' } }), env);
    expect(applicationsResponse.status).toBe(200);
    expect(applicationsResponse.headers.get('Cache-Control')).toBe('no-store');
    const applications = await applicationsResponse.json() as Array<{ id: string; organizationId: string; projectId: string; name: string; slug: string; status: string; applicationType: string }>;
    expect(applications).toEqual([{ id: 'app-la-estacion', organizationId: 'org-la-estacion', projectId: 'project-la-estacion', name: 'TUS ESTACIONES', slug: 'tus-estaciones', status: 'active', applicationType: 'generic' }]);

    const activeApplications = activeWorkspaceApplications(applications);
    expect(buildNavigation({
      mode: 'workspace',
      platformRole: me.user.platformRole,
      permissions: me.memberships[0]?.permissions ?? [],
      workspace: true,
      productTypes: new Set(),
      applicationTypes: new Set(activeApplications.map((application) => application.applicationType ?? 'generic')),
      activeApplications,
      treasureHuntAvailable: false,
    }).map((item) => item.label)).toEqual(['Inicio', 'Analytics']);
  });
});
