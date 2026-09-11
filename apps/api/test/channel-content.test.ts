/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { SITE_CONTENT_PROFILE_KEY } from '../src/services/site-content';

type ContentRow = { channelId: string; organizationId: string; profileKey: string; profileVersion: number; draftContent: string; publishedContent: string | null; publishedAt: number | null; createdAt: number; updatedAt: number };
type Asset = { id: string; organizationId: string; storageKey: string; mimeType: string; archivedAt?: number | null };

function fixture(options: { role?: string; platformRole?: string } = {}) {
  const channels = [
    { id: 'channel-a', organizationId: 'org-a', name: 'Lumbre Web', type: 'external_site', status: 'active', url: 'https://lumbre.example' },
    { id: 'channel-hosted', organizationId: 'org-a', name: 'Hosted', type: 'hosted_runtime', status: 'active', url: null },
  ];
  const contents: ContentRow[] = [];
  const assets: Asset[] = [{ id: 'asset-a', organizationId: 'org-a', storageKey: 'organizations/org-a/assets/asset-a.png', mimeType: 'image/png' }, { id: 'asset-archived', organizationId: 'org-a', storageKey: 'organizations/org-a/assets/asset-archived.png', mimeType: 'image/png', archivedAt: 1 }, { id: 'asset-b', organizationId: 'org-b', storageKey: 'organizations/org-b/assets/asset-b.png', mimeType: 'image/png' }];
  const activity: string[] = [];
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const statement: any = { __sql: sql, __args: args };
          statement.first = async () => {
            if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: options.platformRole ?? 'user', expires_at: Date.now() + 60000 };
            if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' };
            if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-a' ? { id: 'org-a', name: 'Org A', slug: 'org-a', role: options.role ?? 'admin' } : null;
            if (sql.includes('FROM channels') && sql.includes('WHERE id=?')) return channels.find((channel) => channel.id === args[0] && channel.organizationId === args[1]) ?? null;
            if (sql.includes('FROM channel_content')) return contents.find((content) => content.channelId === args[0] && content.organizationId === args[1]) ?? null;
            if (sql.includes('FROM organization_assets')) return assets.find((asset) => asset.id === args[0] && asset.organizationId === args[1] && !asset.archivedAt) ?? null;
            return null;
          };
          statement.run = async () => {
            if (sql.startsWith('INSERT INTO channel_content')) {
              contents.push({ channelId: String(args[0]), organizationId: String(args[1]), profileKey: String(args[2]), profileVersion: Number(args[3]), draftContent: String(args[4]), publishedContent: args[5] as string | null, publishedAt: args[6] as number | null, createdAt: Number(args[7]), updatedAt: Number(args[8]) });
            }
            if (sql.includes('UPDATE channel_content SET draft_content')) {
              const row = contents.find((content) => content.channelId === args[2] && content.organizationId === args[3]);
              if (row) { row.draftContent = String(args[0]); row.updatedAt = Number(args[1]); }
            }
            if (sql.includes('UPDATE channel_content SET published_content')) {
              const row = contents.find((content) => content.channelId === args[3] && content.organizationId === args[4]);
              if (row) { row.publishedContent = String(args[0]); row.publishedAt = Number(args[1]); row.updatedAt = Number(args[2]); }
            }
            if (sql.includes('organization_activity')) activity.push(String(args[3]));
            return { success: true, meta: { changes: 1 } };
          };
          return statement;
        },
      };
    },
  };
  return { DB, contents, assets, activity, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

const validContent = (overrides: Record<string, unknown> = {}) => ({
  hero: { title: 'Lumbre Norte', description: 'Una experiencia para nuestra comunidad.', image: null, ctaLabel: 'Conocer más', ctaUrl: '/contacto' },
  promotion: { enabled: true, title: 'Promoción de temporada', description: 'Descubrí la propuesta.', image: null, ctaLabel: 'Ver más', ctaUrl: 'https://lumbre.example/promocion' },
  ...overrides,
});

describe('editable channel site content', () => {
  it('assigns the stable profile, saves draft content, and publishes an isolated snapshot', async () => {
    const env = fixture({ platformRole: 'corsteno_admin' });
    const assigned = await request('/channels/channel-a/content-profile', env, { method: 'PUT', body: JSON.stringify({ profileKey: SITE_CONTENT_PROFILE_KEY }) });
    expect(assigned.status).toBe(201);
    expect((await assigned.json() as any).profile.key).toBe(SITE_CONTENT_PROFILE_KEY);
    const saved = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: validContent() }) });
    expect(saved.status).toBe(200);
    expect((await saved.json() as any).publishedContent).toBeNull();
    const published = await request('/channels/channel-a/content/publish', env, { method: 'POST' });
    expect(published.status).toBe(200);
    expect((await published.json() as any).publishedContent.hero.title).toBe('Lumbre Norte');
    const changed = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: validContent({ hero: { ...validContent().hero, title: 'Nueva campaña' } }) }) });
    const changedBody = await changed.json() as any;
    expect(changed.status).toBe(200);
    expect(changedBody.draftContent.hero.title).toBe('Nueva campaña');
    expect(changedBody.publishedContent.hero.title).toBe('Lumbre Norte');
    expect(env.activity).toEqual(['channel.content_profile.assigned', 'channel.content.draft_updated', 'channel.content.published', 'channel.content.draft_updated']);
  });

  it('rejects unsafe, unknown, whitespace-only, and overlong fields with structured issues', async () => {
    const env = fixture({ platformRole: 'corsteno_admin' });
    await request('/channels/channel-a/content-profile', env, { method: 'PUT', body: JSON.stringify({ profileKey: SITE_CONTENT_PROFILE_KEY }) });
    const invalid = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: { hero: { title: '   ', ctaUrl: 'javascript:alert(1)', extra: 'no' }, promotion: { enabled: false }, secret: true } }) });
    const body = await invalid.json() as any;
    expect(invalid.status).toBe(422);
    expect(body.error.code).toBe('INVALID_CONTENT');
    expect(body.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTENT_REQUIRED', path: 'hero.title' }),
      expect.objectContaining({ code: 'CONTENT_URL_INVALID', path: 'hero.ctaUrl' }),
      expect.objectContaining({ code: 'CONTENT_UNKNOWN_FIELD', path: 'hero.extra' }),
      expect.objectContaining({ code: 'CONTENT_UNKNOWN_FIELD', path: 'secret' }),
    ]));
    const long = 'x'.repeat(121);
    const tooLong = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: { hero: { title: long }, promotion: {} } }) });
    expect(tooLong.status).toBe(422);
    expect((await tooLong.json() as any).error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CONTENT_MAX_LENGTH', path: 'hero.title' })]));
  });

  it('accepts only active image assets owned by the current organization', async () => {
    const env = fixture({ platformRole: 'corsteno_admin' });
    await request('/channels/channel-a/content-profile', env, { method: 'PUT', body: JSON.stringify({ profileKey: SITE_CONTENT_PROFILE_KEY }) });
    const own = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: validContent({ hero: { ...validContent().hero, image: 'http://localhost/assets/organizations/org-a/assets/asset-a.png' } }) }) });
    expect(own.status).toBe(200);
    expect((await own.json() as any).draftContent.hero.image).toContain('asset-a.png');
    const crossOrg = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: validContent({ hero: { ...validContent().hero, image: 'http://localhost/assets/organizations/org-b/assets/asset-b.png' } }) }) });
    expect(crossOrg.status).toBe(422);
    const archived = await request('/channels/channel-a/content', env, { method: 'PATCH', body: JSON.stringify({ content: validContent({ hero: { ...validContent().hero, image: 'http://localhost/assets/organizations/org-a/assets/asset-archived.png' } }) }) });
    expect(archived.status).toBe(422);
  });

  it('keeps hosted runtime channels out of the generic content editor and protects organization access', async () => {
    const env = fixture({ platformRole: 'corsteno_admin' });
    const hosted = await request('/channels/channel-hosted/content', env);
    expect(hosted.status).toBe(200);
    expect(await hosted.json()).toEqual(expect.objectContaining({ supported: false, profile: null }));
    const assignment = await request('/channels/channel-hosted/content-profile', env, { method: 'PUT', body: JSON.stringify({ profileKey: SITE_CONTENT_PROFILE_KEY }) });
    expect(assignment.status).toBe(409);
    const customer = fixture({ role: 'admin' });
    expect((await request('/channels/channel-a/content-profile', customer, { method: 'PUT', body: JSON.stringify({ profileKey: SITE_CONTENT_PROFILE_KEY }) })).status).toBe(403);
    expect((await request('/channels/channel-a/content', fixture({ role: 'viewer' }))).status).toBe(403);
  });
});
