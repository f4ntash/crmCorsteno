import { describe, expect, it } from 'vitest';
import { getParticipantIdentity } from './experienceAnalytics';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('anonymous roulette identity', () => {
  it('persists the device id and tab session id across reloads', () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    const first = getParticipantIdentity({ localStorage, sessionStorage });
    const afterRefresh = getParticipantIdentity({ localStorage, sessionStorage });
    expect(afterRefresh).toEqual(first);
  });

  it('keeps the device id across new tabs and creates a new session id', () => {
    const localStorage = new MemoryStorage();
    const first = getParticipantIdentity({ localStorage, sessionStorage: new MemoryStorage() });
    const reopened = getParticipantIdentity({ localStorage, sessionStorage: new MemoryStorage() });
    expect(reopened.deviceId).toBe(first.deviceId);
    expect(reopened.sessionId).not.toBe(first.sessionId);
  });

  it('replaces corrupt ids and keeps generated ids stable when storage is unavailable', () => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    localStorage.setItem('corsteno_anon_id', 'not-a-uuid');
    sessionStorage.setItem('corsteno_session_id', 'also-corrupt');
    const repaired = getParticipantIdentity({ localStorage, sessionStorage });
    expect(repaired.deviceId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(repaired.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getParticipantIdentity({ localStorage, sessionStorage })).toEqual(repaired);
    expect(getParticipantIdentity({ localStorage: null, sessionStorage: null })).toEqual(getParticipantIdentity({ localStorage: null, sessionStorage: null }));
  });
});
