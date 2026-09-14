import { describe, expect, it } from 'vitest';
import { previewExperienceUrl, publicExperienceUrl, resolveRuntimeBaseUrl } from '../../web/src/shared/runtime/publicExperienceUrl';
import { resolveRuntimeApiBaseUrl } from '../../runtime/src/config/runtimeEnvironment';

describe('public runtime URL configuration', () => {
  it('uses localhost only for development and encodes legacy slug values', () => {
    const base = resolveRuntimeBaseUrl({ production: false });
    expect(base).toBe('http://localhost:5175');
    expect(publicExperienceUrl('legacy slug/1', base)).toBe('http://localhost:5175/r/legacy%20slug%2F1');
  });

  it('uses the configured production runtime for public and preview links', () => {
    const base = resolveRuntimeBaseUrl({ production: true, configuredBaseUrl: 'https://corsteno-runtime.matiasgerstner.workers.dev/' });
    expect(publicExperienceUrl('villa-carlos-paz', base)).toBe('https://corsteno-runtime.matiasgerstner.workers.dev/r/villa-carlos-paz');
    expect(previewExperienceUrl('experience/1', 'org/1', 'https://crm.corsteno.com/app/experiences/1', base)).toBe('https://corsteno-runtime.matiasgerstner.workers.dev/test/experiences/experience%2F1?org=org%2F1&returnTo=https%3A%2F%2Fcrm.corsteno.com%2Fapp%2Fexperiences%2F1');
  });

  it('rejects missing or local production origins', () => {
    expect(() => resolveRuntimeBaseUrl({ production: true })).toThrow('VITE_RUNTIME_BASE_URL');
    expect(() => resolveRuntimeBaseUrl({ production: true, configuredBaseUrl: 'http://localhost:5175' })).toThrow('localhost');
    expect(() => resolveRuntimeApiBaseUrl({ production: true })).toThrow('VITE_API_URL');
    expect(() => resolveRuntimeApiBaseUrl({ production: true, configuredBaseUrl: 'http://127.0.0.1:8787' })).toThrow('localhost');
  });

  it('keeps production API configuration explicit', () => {
    expect(resolveRuntimeApiBaseUrl({ production: true, configuredBaseUrl: 'https://api.corsteno.com/' })).toBe('https://api.corsteno.com');
  });
});
