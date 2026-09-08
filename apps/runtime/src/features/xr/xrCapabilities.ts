export type ARCapabilityStatus = 'supported' | 'unsupported' | 'unknown';
export type ARCapabilities = { status: ARCapabilityStatus };

type XRSupportApi = { isSessionSupported: (mode: 'immersive-ar') => Promise<boolean> };

export async function getARCapabilities(): Promise<ARCapabilities> {
  const xr = (typeof navigator !== 'undefined' ? (navigator as Navigator & { xr?: XRSupportApi }).xr : undefined);
  if (!xr) return { status: 'unsupported' };
  try { return { status: (await xr.isSessionSupported('immersive-ar')) ? 'supported' : 'unsupported' }; } catch { return { status: 'unknown' }; }
}
