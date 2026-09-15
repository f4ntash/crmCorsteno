type ExperienceEvent = 'experience_view' | 'roulette_spin_click' | 'roulette_spin_started' | 'roulette_result_cta_click' | 'roulette_ar_open_click' | 'roulette_ar_session_started' | 'roulette_ar_placed' | 'roulette_ar_session_ended';
type IdentityStorage = Pick<Storage, 'getItem' | 'setItem'>;
type ParticipantIdentity = { deviceId: string; sessionId: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const volatileIds: Partial<Record<'deviceId' | 'sessionId', string>> = {};
function identifier(storage: IdentityStorage | null, key: string, kind: 'deviceId' | 'sessionId') {
  if (!storage) {
    volatileIds[kind] ??= crypto.randomUUID();
    return volatileIds[kind]!;
  }
  try {
    const existing = storage?.getItem(key);
    if (existing && uuidPattern.test(existing)) return existing;
    const created = crypto.randomUUID();
    storage?.setItem(key, created);
    return created;
  } catch {
    volatileIds[kind] ??= crypto.randomUUID();
    return volatileIds[kind]!;
  }
}
function browserStorage(key: 'localStorage' | 'sessionStorage') {
  try { return typeof window === 'undefined' ? null : window[key]; } catch { return null; }
}
export function getParticipantIdentity(storages?: { localStorage?: IdentityStorage | null; sessionStorage?: IdentityStorage | null }): ParticipantIdentity {
  return {
    deviceId: identifier(storages?.localStorage ?? browserStorage('localStorage'), 'corsteno_anon_id', 'deviceId'),
    sessionId: identifier(storages?.sessionStorage ?? browserStorage('sessionStorage'), 'corsteno_session_id', 'sessionId'),
  };
}
export function createExperienceAnalytics(apiUrl: string, slug: string) {
  const { deviceId: userId, sessionId } = getParticipantIdentity();
  const track = (event: ExperienceEvent, properties: Record<string, unknown> = {}) => { void fetch(`${apiUrl}/public/experiences/${encodeURIComponent(slug)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Anonymous-User-Id': userId, 'X-Session-Id': sessionId }, body: JSON.stringify({ event, userId, sessionId, properties }) }).catch(() => undefined); };
  return { track, trackViewOnce() { const key = `corsteno_experience_view:${slug}`; try { if (browserStorage('sessionStorage')?.getItem(key)) return; browserStorage('sessionStorage')?.setItem(key, '1'); } catch { /* analytics is optional when browser storage is unavailable */ } track('experience_view', { experienceId: slug }); } };
}
