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
] as const;

export type EventName = (typeof KNOWN_EVENT_NAMES)[number];
