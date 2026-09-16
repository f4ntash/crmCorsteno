export type TextureRepeat = { x: number; y: number };

export function calculatePhysicalTextureRepeat(surfaceWidthM: number, surfaceHeightM: number, physicalWidthM: number, physicalHeightM: number): TextureRepeat | null {
  const dimensions = [surfaceWidthM, surfaceHeightM, physicalWidthM, physicalHeightM];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return { x: surfaceWidthM / physicalWidthM, y: surfaceHeightM / physicalHeightM };
}

export function normalizeRotationRadians(rotationDegrees: number): number | null {
  if (!Number.isFinite(rotationDegrees)) return null;
  return (((rotationDegrees % 360) + 360) % 360) * Math.PI / 180;
}
