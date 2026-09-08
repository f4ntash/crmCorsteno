import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExperienceAnalytics, getParticipantIdentity } from './experienceAnalytics';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('experience participant identity', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); vi.stubGlobal('sessionStorage', new MemoryStorage()); });
  it('creates stable device and session UUIDs and reuses them', () => {
    const first = getParticipantIdentity(); const second = getParticipantIdentity();
    expect(first).toEqual(second); expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/i); expect(first.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it('tracks view once per experience session', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 201 }))); vi.stubGlobal('fetch', fetchMock);
    const analytics = createExperienceAnalytics('http://localhost:8787', 'demo'); analytics.trackViewOnce(); analytics.trackViewOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1); const calls = fetchMock.mock.calls as unknown[][]; expect(calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });
});
