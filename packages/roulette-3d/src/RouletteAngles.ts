const TAU = Math.PI * 2;

export function rouletteSegmentCenterAngle(index: number, segmentCount: number) {
  if (!Number.isInteger(index) || !Number.isInteger(segmentCount) || segmentCount < 1 || index < 0 || index >= segmentCount) throw new Error('invalid roulette segment index');
  return -Math.PI / 2 + (index + 0.5) * (TAU / segmentCount);
}

export function rouletteSegmentGeometryStartAngle(index: number, segmentCount: number) {
  if (!Number.isInteger(index) || !Number.isInteger(segmentCount) || segmentCount < 1 || index < 0 || index >= segmentCount) throw new Error('invalid roulette segment index');
  return index * (TAU / segmentCount);
}

export function rouletteRotationToPlaceSegmentAtPointer(index: number, segmentCount: number, currentRotation = 0) {
  const targetAngle = Math.PI / 2 - rouletteSegmentCenterAngle(index, segmentCount);
  const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
  return currentRotation + mod(targetAngle - mod(currentRotation, TAU), TAU);
}
