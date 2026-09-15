import { analyticsBucketTimestamp, formatAnalyticsDate } from '@corsteno/types';

export function formatAnalyticsBucket(timestamp: number, hourly: boolean): string {
  const bucket = analyticsBucketTimestamp(timestamp, hourly ? 'hour' : 'day');
  return formatAnalyticsDate(bucket, hourly
    ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { day: 'numeric', month: 'numeric' });
}

export function formatAnalyticsTooltip(timestamp: number, hourly: boolean): string {
  return formatAnalyticsDate(analyticsBucketTimestamp(timestamp, hourly ? 'hour' : 'day'), hourly
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRecentEventTime(timestamp: number): string {
  return formatAnalyticsDate(timestamp, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

export function formatAnalyticsClock(timestamp: number): string {
  return formatAnalyticsDate(timestamp, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
