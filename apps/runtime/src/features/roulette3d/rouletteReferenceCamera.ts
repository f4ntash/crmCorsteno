export function rouletteReferenceCameraFitDistance(width: number, height: number, radius: number, verticalFovDegrees: number, margin = 1.08) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeRadius = Math.max(0.1, radius);
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * (safeWidth / safeHeight));
  const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
  return (safeRadius / Math.sin(limitingHalfFov)) * margin;
}
