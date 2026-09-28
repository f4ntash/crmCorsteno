export function rouletteReferenceCameraFitDistance(width: number, height: number, radius: number, verticalFovDegrees: number, margin = 1.08) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeRadius = Math.max(0.1, radius);
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * (safeWidth / safeHeight));
  const limitingHalfFov = Math.min(halfVerticalFov, halfHorizontalFov);
  return (safeRadius / Math.sin(limitingHalfFov)) * margin;
}

const MOBILE_CAMERA_MAX_WIDTH = 767;
export const MOBILE_CAMERA_DISTANCE = 54;

export function rouletteReferenceCameraDistance(width: number, height: number, radius: number, verticalFovDegrees: number) {
  const fittedDistance = rouletteReferenceCameraFitDistance(width, height, radius, verticalFovDegrees);
  return width <= MOBILE_CAMERA_MAX_WIDTH ? Math.min(fittedDistance, MOBILE_CAMERA_DISTANCE) : fittedDistance;
}
