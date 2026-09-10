import { describe, expect, it, vi } from 'vitest';
import { publicExperiencesApi } from './publicExperiencesApi';

describe('public experience participation errors', () => {
  it('parses the structured blocked response without exposing identity', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'participation_limit_reached', reason: 'cooldown', message: 'Podrás volver a participar más tarde.', retryAt: '2026-01-01T00:05:00.000Z' }), { status: 429 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toMatchObject({ details: { reason: 'cooldown', retryAt: '2026-01-01T00:05:00.000Z' } });
  });
  it('returns a structured not-found state and sends the stable participant identity', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ active: false, reason: 'not_found' }), { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(publicExperiencesApi.getExperience('missing', { deviceId: 'device', sessionId: 'session' })).resolves.toEqual({ active: false, reason: 'not_found' });
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(call?.[1]).toEqual(expect.objectContaining({ headers: { 'X-Anonymous-User-Id': 'device', 'X-Session-Id': 'session' } }));
  });
  it('loads an authenticated draft preview with organization context', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ config: {}, featureEntitlements: { features: [], maxActiveExperiences: 0 } }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await publicExperiencesApi.getPreview('experience-1', 'org-1');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/experiences/experience-1/preview'), expect.objectContaining({ credentials: 'include', headers: { 'X-Organization-Id': 'org-1' } }));
  });
});
