export interface HealthResponse {
  status: 'ok';
  service: string;
  environment: string;
  timestamp: string;
  version: string;
}

export const KNOWN_EVENT_NAMES = [
  'app_opened',
  'session_started',
  'session_ended',
  'experience_started',
  'experience_finished',
  'image_target_detected',
  'game_started',
  'game_finished',
  'prize_won',
  'prize_claimed',
  'button_clicked',
  'qr_scanned',
  'camera_permission_granted',
  'current_shows_viewed',
  'ar_target_lost',
  'camera_permission_denied',
  'favorite_added',
  'favorite_removed',
  'go_to_show_clicked',
  'offline_mode_used',
  'navigation_started',
  'direction_viewed',
  'navigation_stopped',
  'schedule_viewed',
  'my_schedule_viewed',
  'map_viewed',
  'experience_view',
  'roulette_spin_click',
  'roulette_spin_started',
  'roulette_spin_completed',
  'roulette_prize_won',
  'roulette_no_prize',
  'roulette_result_cta_click',
  'roulette_ar_open_click',
  'roulette_ar_session_started',
  'roulette_ar_placed',
  'roulette_ar_session_ended',
] as const;

export type EventName = (typeof KNOWN_EVENT_NAMES)[number];

export function parseMoneyToMinor(value: string, decimals = 2): number | null {
  const normalized = value.trim().replace(',', '.');
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{1,${decimals}}))?$`);
  const match = normalized.match(pattern);
  if (!match) return null;
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) return null;
  const amount = Number(whole) * (10 ** decimals) + Number(fraction.padEnd(decimals, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatMoneyFromMinor(amountMinor: number, currency: string, locale = 'es-AR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
}
