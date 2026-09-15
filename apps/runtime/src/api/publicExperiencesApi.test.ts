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
  it('sends a stable retry key with the authoritative spin request', async () => {
    const result = { spinId: 'spin-1', segmentIndex: 0, segment: { id: 'segment-1', prizeId: null }, prize: null, claim: null };
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(result), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' }, '55555555-5555-4555-8555-555555555555');
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(JSON.parse(String(call?.[1].body))).toEqual({ deviceId: 'device', sessionId: 'session', requestId: '55555555-5555-4555-8555-555555555555' });
  });
  it('hides internal server details when the response or connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ message: 'database secret' }), { status: 500 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('private network detail'))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
  });
  it('aborts a timed-out request and returns a retryable generic error', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const pending = publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' });
      const rejection = expect(pending).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects successful HTTP responses that are not spin results', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ active: false, reason: 'unavailable' }), { status: 200 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ spinId: 'spin-1', segmentIndex: -1 }), { status: 200 }))));
    await expect(publicExperiencesApi.spin('demo', { deviceId: 'device', sessionId: 'session' })).rejects.toThrow('No pudimos completar la solicitud. Revisá tu conexión e intentá de nuevo.');
  });
});
