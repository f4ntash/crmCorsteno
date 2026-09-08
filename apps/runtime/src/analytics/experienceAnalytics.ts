type ExperienceEvent = 'experience_view' | 'roulette_spin_click' | 'roulette_spin_started' | 'roulette_spin_completed' | 'roulette_result_cta_click' | 'roulette_ar_open_click' | 'roulette_ar_session_started' | 'roulette_ar_placed' | 'roulette_ar_session_ended';
function identifier(storage: Storage, key: string) { const value = storage.getItem(key) ?? crypto.randomUUID(); storage.setItem(key, value); return value; }
export function getParticipantIdentity() { return { deviceId: identifier(localStorage, 'corsteno_anon_id'), sessionId: identifier(sessionStorage, 'corsteno_session_id') }; }
export function createExperienceAnalytics(apiUrl: string, slug: string) {
  const { deviceId: userId, sessionId } = getParticipantIdentity();
  const track = (event: ExperienceEvent, properties: Record<string, unknown> = {}) => { void fetch(`${apiUrl}/public/experiences/${encodeURIComponent(slug)}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Anonymous-User-Id': userId, 'X-Session-Id': sessionId }, body: JSON.stringify({ event, userId, sessionId, properties }) }).catch(() => undefined); };
  return { track, trackViewOnce() { const key = `corsteno_experience_view:${slug}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); track('experience_view', { experienceId: slug }); } };
}
