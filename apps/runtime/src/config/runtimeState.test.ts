import { describe, expect, it } from 'vitest';
import { availabilityMessage } from './runtimeState';

describe('runtime availability messages', () => {
  it.each([
    ['not_found', 'No encontramos esta experiencia.'],
    ['draft', 'Esta experiencia no está publicada.'],
    ['paused', 'Esta experiencia no está publicada.'],
    ['scheduled', 'Esta experiencia todavía no está disponible.'],
    ['expired', 'Esta experiencia finalizó.'],
    ['sold_out', 'Esta experiencia ya no tiene premios disponibles.'],
    ['unavailable', 'Esta experiencia no está disponible.'],
  ])('maps %s to concise public copy', (reason, message) => expect(availabilityMessage(reason)).toBe(message));
});
