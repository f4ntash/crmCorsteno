export const ANALYTICS_TIME_ZONE = 'America/Argentina/Cordoba';

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function analyticsDateParts(timestamp: number): DateParts {
  const parts = Object.fromEntries(
    datePartsFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof DateParts, number>;
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function analyticsBucketTimestamp(timestamp: number, interval: 'hour' | 'day'): number {
  const parts = analyticsDateParts(timestamp);
  const eventAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const utcWholeSecond = Math.floor(timestamp / 1000) * 1000;
  const zoneOffset = eventAsUtc - utcWholeSecond;
  const bucketAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, interval === 'hour' ? parts.hour : 0);
  return bucketAsUtc - zoneOffset;
}

export function formatAnalyticsDate(
  timestamp: number,
  options: Intl.DateTimeFormatOptions,
  locale = 'es-AR',
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: ANALYTICS_TIME_ZONE }).format(timestamp);
}
