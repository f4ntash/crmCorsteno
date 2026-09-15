const eventLabels: Record<string, string> = {
  app_opened: 'App abierta',
  session_started: 'Sesión iniciada',
  session_ended: 'Sesión finalizada',
  experience_started: 'Experiencia iniciada',
  experience_finished: 'Experiencia finalizada',
  image_target_detected: 'Imagen de referencia detectada',
  camera_permission_granted: 'Permiso de cámara concedido',
  camera_permission_denied: 'Permiso de cámara denegado',
  current_shows_viewed: 'Shows consultados',
  favorite_added: 'Show agregado a favoritos',
  favorite_removed: 'Show quitado de favoritos',
  go_to_show_clicked: 'Navegación a un show iniciada',
  offline_mode_used: 'Modo sin conexión utilizado',
  navigation_started: 'Navegación iniciada',
  direction_viewed: 'Dirección consultada',
  navigation_stopped: 'Navegación finalizada',
  schedule_viewed: 'Agenda consultada',
  my_schedule_viewed: 'Mi agenda consultada',
  map_viewed: 'Mapa consultado',
  experience_view: 'Vista de experiencia',
  roulette_spin_click: 'Clic en girar',
  roulette_spin_started: 'Giro iniciado',
  roulette_spin_completed: 'Giro completado',
  roulette_spin_blocked: 'Giro bloqueado',
  roulette_prize_won: 'Premio otorgado',
  roulette_result_cta_click: 'Clic en CTA del resultado',
  roulette_ar_open_click: 'AR abierto',
  roulette_ar_session_started: 'Sesión AR iniciada',
  roulette_ar_placed: 'Ruleta colocada',
  roulette_ar_session_ended: 'Sesión AR finalizada',
  cooldown: 'En período de espera',
  device_limit: 'Límite por dispositivo',
  session_limit: 'Límite por sesión',
  already_participated: 'Ya participó',
  identity_required: 'Identidad requerida',
};

export function readableEventLabel(value: string): string {
  const key = value.trim().toLowerCase().replaceAll(' ', '_');
  return eventLabels[key] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export { eventLabels };
