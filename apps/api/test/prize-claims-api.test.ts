import { describe, expect, it } from 'vitest';
import app from '../src';

function environment(role = 'owner', organizationId = 'org-a') {
  let status = 'active';
  const claim = {
    id: 'claim-1',
    experienceId: 'experience-1',
    code: 'ABCD2345-EFGH6789',
    prizeId: 'prize-1',
    prizeName: 'Remera',
    status: 'active',
    createdAt: '2026-01-01',
    redeemedAt: null,
  };
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions'))
                return {
                  session_id: 'session',
                  id: 'user-1',
                  email: 'operator@example.com',
                  name: 'Operator',
                  platformRole: 'user',
                  expires_at: Date.now() + 60_000,
                } as T;
              if (sql.includes('FROM organizations'))
                return {
                  id: organizationId,
                  name: 'Org',
                  slug: 'org',
                  role,
                } as T;
              if (sql.includes('FROM experiences'))
                return organizationId === 'org-a'
                  ? ({ id: 'experience-1' } as T)
                  : null;
              if (sql.includes('SELECT status FROM roulette_prize_claims'))
                return status === 'redeemed' ? ({ status } as T) : null;
              if (sql.includes('FROM roulette_prize_claims'))
                return { ...claim, status } as T;
              if (sql.includes('application_id'))
                return { applicationId: null } as T;
              return null as T;
            },
            async all<T>() {
              return { results: [{ ...claim, status }] as T[] };
            },
            async run() {
              if (
                sql.startsWith('UPDATE roulette_prize_claims') &&
                status === 'active'
              ) {
                status = 'redeemed';
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}
function request(
  path: string,
  env: ReturnType<typeof environment>,
  init?: RequestInit,
) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: new Headers({
        Cookie: 'corsteno_session=x',
        'X-Organization-Id': 'org-a',
        ...init?.headers,
      }),
    }),
    env,
  );
}

describe('roulette prize claim operations', () => {
  it('looks up a claim without redeeming it', async () => {
    const env = environment();
    const response = await request('/experiences/claims/lookup?code=abcd2345-efgh6789', env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ experienceId: 'experience-1', claim: expect.objectContaining({ status: 'active', code: 'ABCD2345-EFGH6789' }) });
    expect((await request('/experiences/experience-1/claims/claim-1/redeem', env, { method: 'POST' })).status).toBe(200);
  });
  it('lists, redeems exactly once, and rejects a second redemption', async () => {
    const env = environment();
    expect(
      (await request('/experiences/experience-1/claims', env)).status,
    ).toBe(200);
    const redeemed = await request(
      '/experiences/experience-1/claims/claim-1/redeem',
      env,
      { method: 'POST' },
    );
    expect(redeemed.status).toBe(200);
    expect(((await redeemed.json()) as { status: string }).status).toBe(
      'redeemed',
    );
    const second = await request(
      '/experiences/experience-1/claims/claim-1/redeem',
      env,
      { method: 'POST' },
    );
    expect(second.status).toBe(409);
  });
  it('requires manage permission and keeps tenant isolation', async () => {
    expect(
      (
        await request(
          '/experiences/experience-1/claims/claim-1/redeem',
          environment('member'),
          { method: 'POST' },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          '/experiences/experience-1/claims',
          environment('owner', 'org-b'),
        )
      ).status,
    ).toBe(404);
  });
});
