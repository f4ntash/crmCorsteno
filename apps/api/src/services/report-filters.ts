export type ReportRange = '24h' | '7d' | '30d' | 'all';

export function reportRangeOf(value: string | null | undefined): ReportRange {
  return value === '24h' || value === '7d' || value === '30d' || value === 'all' ? value : '7d';
}

export function reportSinceOf(range: ReportRange, now = Date.now()) {
  return range === 'all' ? 0 : now - { '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[range];
}

export function reportSinceIsoOf(range: ReportRange, now = Date.now()) {
  return new Date(reportSinceOf(range, now)).toISOString();
}
