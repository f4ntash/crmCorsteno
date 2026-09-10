export type RuntimeAvailabilityReason = 'not_found' | 'draft' | 'paused' | 'scheduled' | 'expired' | 'unavailable' | 'sold_out';

export function availabilityMessage(reason?: string) {
  if (reason === 'scheduled') return 'Esta experiencia todavía no está disponible.';
  if (reason === 'expired') return 'Esta experiencia finalizó.';
  if (reason === 'sold_out') return 'Esta experiencia ya no tiene premios disponibles.';
  if (reason === 'draft' || reason === 'paused') return 'Esta experiencia no está publicada.';
  if (reason === 'not_found') return 'No encontramos esta experiencia.';
  return 'Esta experiencia no está disponible.';
}
