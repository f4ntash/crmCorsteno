import { describe, expect, it, vi } from 'vitest';
import { publicExperiencesApi } from './publicExperiencesApi';

describe('public experience participation errors', () => {
  it('parses the structured blocked response without exposing identity', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'participation_limit_reached', reason: 'cooldown', message: 'Podrás volver a participar más tarde.', retryAt: '2026-01-01T00:05:00.000Z' }), { status: 429 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toMatchObject({ details: { reason: 'cooldown', retryAt: '2026-01-01T00:05:00.000Z' } });
  });
});
