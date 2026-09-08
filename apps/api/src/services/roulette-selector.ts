type RouletteSelectionConfig = { segments: readonly unknown[] };

const UINT32_RANGE = 0x1_0000_0000;

export function selectRouletteSegment(config: RouletteSelectionConfig, randomValue: number) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1 || config.segments.length === 0) throw new Error('invalid roulette selection input');
  return Math.min(config.segments.length - 1, Math.floor(randomValue * config.segments.length));
}

export function secureRandomIndex(length: number) {
  if (!Number.isInteger(length) || length < 1) throw new Error('invalid roulette segment count');
  const limit = Math.floor(UINT32_RANGE / length) * length;
  const bytes = new Uint32Array(1);
  let value = UINT32_RANGE;
  while (value >= limit) {
    crypto.getRandomValues(bytes);
    value = bytes[0]!;
  }
  return value % length;
}
