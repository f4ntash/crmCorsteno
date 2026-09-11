/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { recordActivity, serializeActivityMetadata } from '../src/services/activity';

type ActivityRow = { id: string; organization_id: string; actor_user_id: string | null; action: string; resource_type: string; resource_id: string | null; metadata: string; created_at: number; actorName?: string | null; actorEmail?: string | null };

function fixture(options: { role?: string; platformRole?: string; activity?: ActivityRow[]; failActivity?: boolean } = {}) {
  const activity = [...(options.activity ?? [])];
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const statement: any = { __sql: sql, __args: args };
          statement.first = async () => {
            if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: options.platformRole ?? 'user', expires_at: Date.now() + 60000 };
            if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' };
            if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-a' ? { id: 'org-a', name: 'Org A', slug: 'org-a', role: options.role ?? 'member' } : null;
            if (sql.includes('FROM memberships m')) return { role: 'member', status: 'active', name: 'Target', email: 'target@test.local' };
            if (sql.includes('COUNT(*) count')) return { count: 2 };
            if (sql.includes('FROM roulette_prize_claims') && sql.includes('code=?')) return { id: 'claim-1', experienceId: 'experience-1', code: 'WIN-1', prizeId: 'prize-1', prizeName: 'Café gratis', status: 'active', createdAt: 1, redeemedAt: null };
            if (sql.includes('FROM experiences')) return { id: 'experience-1', name: 'Campaign', status: 'draft', startsAt: null, endsAt: null, draftConfig: null, publishedConfig: null };
            return null;
          };
          statement.all = async () => {
            if (!sql.includes('organization_activity')) return { results: [] };
            const limit = Number(args[args.length - 2]);
            const offset = Number(args[args.length - 1]);
            return { results: activity.filter((item) => item.organization_id === 'org-a').slice(offset, offset + limit).map((item) => ({ id: item.id, action: item.action, resourceType: item.resource_type, resourceId: item.resource_id, metadata: item.metadata, createdAt: item.created_at, actorName: item.actorName ?? 'Actor', actorEmail: item.actorEmail ?? 'actor@test.local' })) };
          };
          statement.run = async () => {
            statements.push({ sql, args });
            if (sql.includes('organization_activity')) {
              if (options.failActivity) throw new Error('activity unavailable');
              activity.push({ id: String(args[0]), organization_id: String(args[1]), actor_user_id: args[2] as string | null, action: String(args[3]), resource_type: String(args[4]), resource_id: args[5] as string | null, metadata: String(args[6]), created_at: Number(args[7]) });
            }
            return { success: true, meta: { changes: 1 } };
          };
          statements.push({ sql, args });
          return statement;
        },
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', activity, statements };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('organization activity infrastructure', () => {
  it('records generic server-provided organization and actor context with bounded safe metadata', async () => {
    const env = fixture();
    await recordActivity(env.DB, { organizationId: 'org-a', actorUserId: 'actor' }, { action: 'future.module_changed', resourceType: 'future_module', resourceId: 'resource-1', metadata: { label: 'Useful context', delta: 2 } });
    expect(env.activity).toHaveLength(1);
    expect(env.activity[0]).toMatchObject({ organization_id: 'org-a', actor_user_id: 'actor', action: 'future.module_changed', resource_type: 'future_module', resource_id: 'resource-1' });
    expect(JSON.parse(env.activity[0]!.metadata)).toEqual({ label: 'Useful context', delta: 2 });
    expect(() => serializeActivityMetadata({ password: 'should never be logged' })).toThrow();
  });

  it('returns only current-organization activity with bounded pagination and parsed metadata', async () => {
    const activity = Array.from({ length: 51 }, (_, index) => ({ id: `a-${index}`, organization_id: 'org-a', actor_user_id: 'actor', action: 'experience.updated', resource_type: 'experience', resource_id: `experience-${index}`, metadata: JSON.stringify({ name: `Campaign ${index}` }), created_at: index, actorName: 'Actor', actorEmail: 'actor@test.local' }));
    activity.push({ id: 'foreign', organization_id: 'org-b', actor_user_id: 'other', action: 'claim.redeemed', resource_type: 'claim', resource_id: 'claim', metadata: '{}', created_at: 999, actorName: 'Other', actorEmail: 'other@test.local' });
    const response = await request('/organizations/activity?limit=100', fixture({ activity }));
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.items).toHaveLength(50);
    expect(body.items[0].metadata).toEqual({ name: 'Campaign 0' });
    expect(body.items.some((item: any) => item.id === 'foreign')).toBe(false);
    expect(body.pagination.nextOffset).toBe(50);
  });

  it('keeps platform-admin organization context available', async () => {
    const response = await request('/organizations/activity', fixture({ platformRole: 'corsteno_admin', activity: [{ id: 'a', organization_id: 'org-a', actor_user_id: null, action: 'experience.created', resource_type: 'experience', resource_id: 'e', metadata: '{}', created_at: 1 }] }));
    expect(response.status).toBe(200);
  });

  it('denies activity reads to viewer and operator roles and to another organization', async () => {
    expect((await request('/organizations/activity', fixture({ role: 'viewer' }))).status).toBe(403);
    expect((await request('/organizations/activity', fixture({ role: 'operator' }))).status).toBe(403);
    expect((await request('/organizations/activity', fixture(), { headers: { 'X-Organization-Id': 'org-b' } })).status).toBe(403);
  });

  it('logs an authorized membership role change but not an unauthorized mutation', async () => {
    const env = fixture({ role: 'admin' });
    const response = await request('/organizations/members/member-1', env, { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) });
    expect(response.status).toBe(200);
    expect(env.activity).toHaveLength(1);
    expect(env.activity[0]).toMatchObject({ actor_user_id: 'actor', action: 'member.role_changed', resource_id: 'member-1' });

    const denied = fixture({ role: 'member' });
    expect((await request('/organizations/members/member-1', denied, { method: 'PATCH', body: JSON.stringify({ role: 'admin' }) })).status).toBe(403);
    expect(denied.activity).toHaveLength(0);
  });

  it('logs successful experience updates and claim redemptions with server-side actor context', async () => {
    const env = fixture({ role: 'admin' });
    expect((await request('/experiences/experience-1', env, { method: 'PATCH', body: JSON.stringify({ name: 'Updated campaign' }) })).status).toBe(200);
    expect((await request('/experiences/claims/redeem', env, { method: 'POST', body: JSON.stringify({ code: 'WIN-1' }) })).status).toBe(200);
    expect(env.activity.map((item) => item.action)).toEqual(['experience.updated', 'claim.redeemed']);
    expect(env.activity.every((item) => item.organization_id === 'org-a' && item.actor_user_id === 'actor')).toBe(true);
    expect(env.activity.some((item) => item.metadata.includes('device') || item.metadata.includes('session'))).toBe(false);
  });

  it('does not fail the primary mutation when activity storage is unavailable', async () => {
    const env = fixture({ role: 'admin', failActivity: true });
    const response = await request('/organizations/members/member-1', env, { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) });
    expect(response.status).toBe(200);
    expect(env.activity).toHaveLength(0);
  });
});
