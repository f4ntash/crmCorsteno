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
] as const;

export type EventName = (typeof KNOWN_EVENT_NAMES)[number];
