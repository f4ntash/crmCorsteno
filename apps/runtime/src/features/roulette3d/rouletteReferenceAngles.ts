const TAU = Math.PI * 2;

const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function rouletteReferenceRotationToPlaceSegmentAtPointer(
  targetSegmentIndex: number,
  segmentCount: number,
  currentRotation = 0,
  extraTurns = 5,
) {
  if (
    !Number.isInteger(targetSegmentIndex)
    || !Number.isInteger(segmentCount)
    || segmentCount < 1
    || targetSegmentIndex < 0
    || targetSegmentIndex >= segmentCount
    || !Number.isFinite(currentRotation)
  ) return null;

  const step = TAU / segmentCount;
  const currentAngle = mod(currentRotation, TAU);
  const alignmentDelta = mod(targetSegmentIndex * step - currentAngle, TAU);
  return currentRotation + alignmentDelta + extraTurns * TAU;
}

export function rouletteReferenceSegmentAtPointer(rotation: number, segmentCount: number) {
  if (!Number.isFinite(rotation) || !Number.isInteger(segmentCount) || segmentCount < 1) return null;
  const step = TAU / segmentCount;
  return Math.floor((mod(rotation, TAU) + step * 0.5) / step) % segmentCount;
}
