import { analyticsBucketTimestamp, formatAnalyticsDate } from '@corsteno/types';

export function formatAnalyticsBucket(timestamp: number, hourly: boolean): string {
  const bucket = analyticsBucketTimestamp(timestamp, hourly ? 'hour' : 'day');
  const formatted = formatAnalyticsDate(bucket, hourly
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { day: 'numeric', month: 'numeric' });
  return hourly ? `${formatted} ART` : formatted;
}

export function formatAnalyticsTooltip(timestamp: number, hourly: boolean): string {
  const formatted = formatAnalyticsDate(analyticsBucketTimestamp(timestamp, hourly ? 'hour' : 'day'), hourly
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  return hourly ? `${formatted} ART` : formatted;
}

export function formatRecentEventTime(timestamp: number): string {
  return `${formatAnalyticsDate(timestamp, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })} ART`;
}

export function formatAnalyticsClock(timestamp: number): string {
  return `${formatAnalyticsDate(timestamp, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} ART`;
}

export function formatStoredUtcDateTime(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp)
    ? `${formatAnalyticsDate(timestamp, { dateStyle: 'medium', timeStyle: 'medium' })} ART`
    : 'Fecha desconocida';
}
