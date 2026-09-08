import { describe, expect, it, vi } from 'vitest';
import { getARCapabilities } from './xrCapabilities';

describe('getARCapabilities', () => {
  it('returns unsupported when WebXR is not exposed', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getARCapabilities()).resolves.toEqual({ status: 'unsupported' });
  });

  it('reports immersive AR support without relying on the user agent', async () => {
    vi.stubGlobal('navigator', { xr: { isSessionSupported: vi.fn().mockResolvedValue(true) } });
    await expect(getARCapabilities()).resolves.toEqual({ status: 'supported' });
  });

  it('returns unknown when capability detection fails', async () => {
    vi.stubGlobal('navigator', { xr: { isSessionSupported: vi.fn().mockRejectedValue(new Error('permission')) } });
    await expect(getARCapabilities()).resolves.toEqual({ status: 'unknown' });
  });
});
