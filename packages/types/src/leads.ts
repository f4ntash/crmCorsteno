export const FINDER_LOCATION_MIN_LENGTH = 2;

export function isValidFinderLocation(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= FINDER_LOCATION_MIN_LENGTH;
}
