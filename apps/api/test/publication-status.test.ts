import { describe, expect, it } from 'vitest';
import {
  canEditPublicationAvailability,
  formatPublicationDate,
  fromDateTimeLocal,
  publicationStatusExplanation,
  toDateTimeLocal,
  validateAvailabilityWindow,
} from '../../web/src/shared/publication/status';

describe('shared publication scheduling helpers', () => {
  it('round trips persisted timestamps through the browser-local editor format', () => {
    const persisted = '2026-06-15T12:00:00.000Z';
    expect(fromDateTimeLocal(toDateTimeLocal(persisted))).toBe(persisted);
  });

  it('formats dates in the requested timezone, including daylight-saving time', () => {
    expect(formatPublicationDate('2026-07-01T12:00:00.000Z', 'en-US', 'America/New_York')).toContain('8:00 AM');
  });

  it('explains future, expired and unavailable states without creating a second status model', () => {
    expect(publicationStatusExplanation('scheduled', '2026-06-16T00:00:00Z', null, null, 'en-US', 'UTC')).toContain('Comienza el');
    expect(publicationStatusExplanation('expired', null, '2026-06-14T00:00:00Z', null, 'en-US', 'UTC')).toContain('Finalizó el');
    expect(publicationStatusExplanation('active', null, null, 'no_access', 'en-US', 'UTC')).toBe('El acceso no está disponible.');
  });

  it('allows empty dates and valid past dates while rejecting malformed or reversed ranges', () => {
    expect(validateAvailabilityWindow('', '')).toBeUndefined();
    expect(validateAvailabilityWindow('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')).toBeUndefined();
    expect(validateAvailabilityWindow('not-a-date', '')).toBe('La fecha de inicio no es válida.');
    expect(validateAvailabilityWindow('', 'not-a-date')).toBe('La fecha de fin no es válida.');
    expect(validateAvailabilityWindow('2026-06-16T00:00:00Z', '2026-06-15T00:00:00Z')).toBe('La fecha de fin debe ser posterior al inicio.');
  });

  it('keeps read-only users out of availability mutations', () => {
    expect(canEditPublicationAvailability(true, false)).toBe(true);
    expect(canEditPublicationAvailability(true, true)).toBe(false);
    expect(canEditPublicationAvailability(false, false)).toBe(false);
  });
});
