/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type ChannelState = { id: string; organizationId: string; name: string; type: string; status: string; url: string | null; createdAt: number; updatedAt: number };

function fixture(options: { role?: string; platformRole?: string } = {}) {
  const channels: ChannelState[] = [{ id: 'channel-a', organizationId: 'org-a', name: 'Hosted A', type: 'hosted_runtime', status: 'active', url: null, createdAt: 1, updatedAt: 1 }];
  const experiences = [{ id: 'experience-a', organizationId: 'org-a', name: 'Campaign A', slug: 'campaign-a', type: 'roulette', status: 'draft', startsAt: null, endsAt: null }, { id: 'experience-b', organizationId: 'org-b', name: 'Campaign B', slug: 'campaign-b', type: 'roulette', status: 'draft', startsAt: null, endsAt: null }];
  const links: Array<{ id: string; organizationId: string; experienceId: string; channelId: string }> = [];
  const activity: Array<Record<string, unknown>> = [];
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const statement: any = { __sql: sql, __args: args };
          statement.first = async () => {
            if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: options.platformRole ?? 'user', expires_at: Date.now() + 60000 };
            if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' };
            if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-a' ? { id: 'org-a', name: 'Org A', slug: 'org-a', role: options.role ?? 'admin' } : null;
            if (sql.includes('FROM channels') && sql.includes('WHERE id=?')) { const item = channels.find((candidate) => candidate.id === args[0] && candidate.organizationId === args[1]); return item ? { ...item } : null; }
            if (sql.includes('FROM experiences') && sql.includes('id=?')) { const item = experiences.find((candidate) => candidate.id === args[0] && candidate.organizationId === args[1]); return item ? { ...item } : null; }
            return null;
          };
          statement.all = async () => {
            if (sql.includes('FROM channels c LEFT JOIN')) return { results: channels.filter((item) => item.organizationId === args[0]).map((item) => ({ ...item, linkedExperienceCount: links.filter((link) => link.channelId === item.id && link.organizationId === item.organizationId).length })) };
            if (sql.includes('FROM experience_channels ec JOIN experiences')) return { results: links.filter((link) => link.channelId === args[0] && link.organizationId === args[1]).map((link) => experiences.find((item) => item.id === link.experienceId)).filter(Boolean) };
            if (sql.includes('FROM experience_channels ec JOIN channels')) return { results: links.filter((link) => link.experienceId === args[0] && link.organizationId === args[1]).map((link) => channels.find((item) => item.id === link.channelId)).filter(Boolean) };
            return { results: [] };
          };
          statement.run = async () => {
            statements.push({ sql, args });
            if (sql.includes('organization_activity')) activity.push({ action: args[3], resourceId: args[5] });
            if (sql.includes('INSERT INTO channels')) {
              if (channels.some((item) => item.organizationId === args[1] && item.name === args[2])) throw new Error('UNIQUE constraint failed: channels.organization_name');
              channels.push({ id: String(args[0]), organizationId: String(args[1]), name: String(args[2]), type: String(args[3]), status: 'active', url: (args[4] as string | null) ?? null, createdAt: Number(args[5]), updatedAt: Number(args[6]) });
            }
            if (sql.includes('UPDATE channels')) {
              const id = String(args.at(-2));
              const organizationId = String(args.at(-1));
              const item = channels.find((channel) => channel.id === id && channel.organizationId === organizationId);
              if (item) {
                const values = args.slice(0, -2);
                if (sql.includes('name=?')) item.name = String(values[0]);
                if (sql.includes('status=?')) item.status = String(values[sql.includes('name=?') ? 1 : 0]);
                if (sql.includes('url=?')) item.url = (values[sql.includes('name=?') ? 1 : 0] as string | null) ?? null;
              }
            }
            if (sql.includes('INSERT OR IGNORE INTO experience_channels')) {
              const link = { id: String(args[0]), organizationId: String(args[1]), experienceId: String(args[2]), channelId: String(args[3]) };
              if (!links.some((item) => item.experienceId === link.experienceId && item.channelId === link.channelId)) links.push(link);
              return { meta: { changes: 1 } };
            }
            if (sql.includes('DELETE FROM experience_channels')) {
              const before = links.length;
              for (let index = links.length - 1; index >= 0; index -= 1) if (links[index]?.organizationId === args[0] && links[index]?.channelId === args[1] && links[index]?.experienceId === args[2]) links.splice(index, 1);
              return { meta: { changes: before - links.length } };
            }
            return { meta: { changes: 1 } };
          };
          statements.push({ sql, args });
          return statement;
        },
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test', channels, experiences, links, activity, statements };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('organization sites and channels', () => {
  it('blocks product management routes when the workspace is not Product Catalog', async () => {
    const env = fixture();
    expect((await request('/channels/channel-a/products', env)).status).toBe(403);
    expect((await request('/channels/channel-a/products', env, { method: 'POST', body: JSON.stringify({ productId: 'product-a' }) })).status).toBe(403);
  });

  it('lists only the current organization channels and keeps platform access', async () => {
    const env = fixture({ platformRole: 'corsteno_admin' });
    env.channels.push({ id: 'channel-b', organizationId: 'org-b', name: 'Other', type: 'external_site', status: 'active', url: 'https://other.example', createdAt: 1, updatedAt: 1 });
    const response = await request('/channels', env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({ id: 'channel-a', organizationId: 'org-a', linkedExperienceCount: 0 })]);
    expect((await request('/channels', env, { headers: { 'X-Organization-Id': 'org-b' } })).status).toBe(200);
  });

  it('creates external and Corsteno site records with normalized safe URLs', async () => {
    const env = fixture();
    const created = await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Lumbre Norte Web', type: 'external_site', url: 'HTTPS://Example.com/' }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(expect.objectContaining({ name: 'Lumbre Norte Web', type: 'external_site', url: 'https://example.com' }));
    const corsteno = await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Lumbre Norte Site', type: 'corsteno_site' }) });
    expect(corsteno.status).toBe(201);
    expect(await corsteno.json()).toEqual(expect.objectContaining({ type: 'corsteno_site', url: null }));
    expect(env.activity.map((item) => item.action)).toEqual(['channel.created', 'channel.created']);
  });

  it('rejects invalid types, malformed URLs, unsafe schemes, and duplicate names', async () => {
    const env = fixture();
    expect((await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Bad', type: 'other', url: 'https://example.com' }) })).status).toBe(400);
    expect((await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Bad', type: 'external_site', url: 'javascript:alert(1)' }) })).status).toBe(400);
    expect((await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Bad', type: 'external_site', url: 'example.com' }) })).status).toBe(400);
    expect((await request('/channels', env, { method: 'POST', body: JSON.stringify({ name: 'Hosted A', type: 'hosted_runtime' }) })).status).toBe(409);
  });

  it('links and unlinks only same-organization experiences idempotently', async () => {
    const env = fixture();
    const linked = await request('/channels/channel-a/experiences', env, { method: 'POST', body: JSON.stringify({ experienceId: 'experience-a' }) });
    expect(linked.status).toBe(200);
    const linkedBody = await linked.json() as { experiences: unknown[] };
    expect(linkedBody.experiences).toHaveLength(1);
    expect(await (await request('/experiences/experience-a/channels', env)).json()).toEqual({ items: [expect.objectContaining({ id: 'channel-a', name: 'Hosted A' })] });
    const duplicate = await request('/channels/channel-a/experiences', env, { method: 'POST', body: JSON.stringify({ experienceId: 'experience-a' }) });
    expect(duplicate.status).toBe(200);
    expect(env.links).toHaveLength(1);
    expect((await request('/channels/channel-a/experiences', env, { method: 'POST', body: JSON.stringify({ experienceId: 'experience-b' }) })).status).toBe(404);
    expect((await request('/channels/channel-a/experiences/experience-a', env, { method: 'DELETE' })).status).toBe(200);
    expect(env.links).toHaveLength(0);
  });

  it('allows authorized status updates, preserves linked experiences, and denies non-managers', async () => {
    const env = fixture();
    await request('/channels/channel-a/experiences', env, { method: 'POST', body: JSON.stringify({ experienceId: 'experience-a' }) });
    const updated = await request('/channels/channel-a', env, { method: 'PATCH', body: JSON.stringify({ name: 'Hosted inactive', status: 'inactive' }) });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual(expect.objectContaining({ name: 'Hosted inactive', status: 'inactive', experiences: [expect.objectContaining({ id: 'experience-a' })] }));
    expect(env.activity.map((item) => item.action)).toContain('channel.deactivated');
    expect((await request('/channels/channel-a', fixture({ role: 'member' }), { method: 'PATCH', body: JSON.stringify({ name: 'Nope' }) })).status).toBe(403);
  });

  it('denies cross-organization channel access to a normal customer', async () => {
    expect((await request('/channels/channel-a', fixture(), { headers: { 'X-Organization-Id': 'org-b' } })).status).toBe(403);
  });
});
