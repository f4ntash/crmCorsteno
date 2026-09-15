import { describe, expect, it } from 'vitest';
import { analyticsBucketTimestamp, analyticsDateParts } from '@corsteno/types';
import { formatAnalyticsBucket, formatAnalyticsClock, formatAnalyticsTooltip, formatRecentEventTime } from '../../web/src/features/dashboard/analytics-format';
import { readableEventLabel } from '../../web/src/features/dashboard/event-labels';

describe('analytics timezone and display', () => {
  it('keeps stored event precision through local hourly and daily bucket calculation', () => {
    const eventAt = Date.parse('2026-09-15T12:37:14.987Z');
    expect(eventAt % 1000).toBe(987);
    expect(analyticsDateParts(eventAt)).toMatchObject({ year: 2026, month: 9, day: 15, hour: 9, minute: 37, second: 14 });
    expect(analyticsBucketTimestamp(eventAt, 'hour')).toBe(Date.parse('2026-09-15T12:00:00.000Z'));
    expect(analyticsBucketTimestamp(eventAt, 'day')).toBe(Date.parse('2026-09-15T03:00:00.000Z'));
  });

  it('separates adjacent hours while retaining millisecond timestamps', () => {
    const first = Date.parse('2026-09-15T12:59:59.999Z');
    const next = Date.parse('2026-09-15T13:00:00.001Z');
    expect(analyticsBucketTimestamp(first, 'hour')).not.toBe(analyticsBucketTimestamp(next, 'hour'));
  });

  it('uses the Argentina day boundary rather than UTC midnight', () => {
    const beforeLocalMidnight = Date.parse('2026-09-15T02:59:59.999Z');
    const afterLocalMidnight = Date.parse('2026-09-15T03:00:00.001Z');
    expect(analyticsDateParts(beforeLocalMidnight)).toMatchObject({ day: 14, hour: 23 });
    expect(analyticsDateParts(afterLocalMidnight)).toMatchObject({ day: 15, hour: 0 });
    expect(analyticsBucketTimestamp(beforeLocalMidnight, 'day')).not.toBe(analyticsBucketTimestamp(afterLocalMidnight, 'day'));
  });

  it('formats hourly ticks, tooltips, and recent timestamps in Argentina time', () => {
    const timestamp = Date.parse('2026-09-15T12:37:14.000Z');
    expect(formatAnalyticsBucket(timestamp, true)).toBe('09:00');
    expect(formatAnalyticsClock(timestamp)).toBe('09:37');
    expect(formatAnalyticsBucket(timestamp, false)).toBe('15/9');
    expect(formatAnalyticsTooltip(timestamp, true)).toContain('09:00');
    expect(formatRecentEventTime(timestamp)).toContain('09:37:14');
  });

  it('maps Cosquín events to human labels', () => {
    expect(readableEventLabel('app_opened')).toBe('App abierta');
    expect(readableEventLabel('session_started')).toBe('Sesión iniciada');
    expect(readableEventLabel('experience_started')).toBe('Experiencia iniciada');
    expect(readableEventLabel('camera_permission_denied')).toBe('Permiso de cámara denegado');
    expect(readableEventLabel('custom_event')).toBe('Custom Event');
  });
});
