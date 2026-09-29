import { describe, expect, it } from 'vitest';
import app from '../src';

function fixture() {
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user', email: 'u@example.com', name: 'User', platformRole: 'corsteno_admin', expires_at: Date.now() + 60000 };
              if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role: 'owner' };
              return null;
            },
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

describe('online payment routes are disabled', () => {
  it('does not expose subscription checkout or Mercado Pago webhooks', async () => {
    const env = fixture();
    const checkout = await app.fetch(new Request('http://localhost/subscriptions/sub-a/checkout', {
      method: 'POST',
      headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json' },
    }), env);
    const webhook = await app.fetch(new Request('http://localhost/webhooks/mercado-pago', {
      method: 'POST',
      headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json' },
    }), env);
    expect(checkout.status).toBe(404);
    expect(webhook.status).toBe(404);
  });
});
