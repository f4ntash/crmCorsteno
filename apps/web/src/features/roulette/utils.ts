import type { RouletteConfig, RouletteSegment } from './types';

export function resolvePrizeLabels(config: RouletteConfig): (RouletteSegment & { label: string; iconUrl: string | null })[] {
  return config.segments.map((segment) => { const prize = config.prizes.find((item) => item.id === segment.prizeId); return { ...segment, label: prize?.name ?? 'Sin premio', iconUrl: prize?.iconUrl ?? null }; });
}
