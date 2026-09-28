import { describe, expect, it } from 'vitest';
import { previewExperienceUrl, publicExperienceUrl, resolveRuntimeBaseUrl } from '../../web/src/shared/runtime/publicExperienceUrl';
import { resolveRuntimeApiBaseUrl } from '../../runtime/src/config/runtimeEnvironment';

describe('public runtime URL configuration', () => {
  it('uses localhost only for development and encodes legacy slug values', () => {
    const base = resolveRuntimeBaseUrl({ production: false });
    expect(base).toBe('http://localhost:5175');
    expect(publicExperienceUrl('legacy slug/1', base)).toBe('http://localhost:5175/r/legacy%20slug%2F1');
  });

  it('uses corsteno.com for production public and preview links regardless of legacy runtime settings', () => {
    for (const configuredBaseUrl of [
      'https://corsteno-runtime.matiasgerstner.workers.dev/',
      'https://corsteno-treasure-hunt.pages.dev/',
      'https://unrelated-runtime.example/',
      'http://localhost:5175',
    ]) {
      expect(resolveRuntimeBaseUrl({ production: true, configuredBaseUrl })).toBe('https://corsteno.com');
    }
    const base = resolveRuntimeBaseUrl({ production: true, configuredBaseUrl: 'https://corsteno-treasure-hunt.pages.dev/' });
    expect(publicExperienceUrl('villa-carlos-paz', base)).toBe('https://corsteno.com/r/villa-carlos-paz');
    expect(previewExperienceUrl('experience/1', 'org/1', 'https://crm.corsteno.com/app/experiences/1', base)).toBe('https://corsteno.com/test/experiences/experience%2F1?org=org%2F1&returnTo=https%3A%2F%2Fcrm.corsteno.com%2Fapp%2Fexperiences%2F1');
  });

  it('routes Roulette links through /r/:slug and redirects a Treasure Hunt host to the CRM runtime', () => {
    const base = resolveRuntimeBaseUrl({ production: true, configuredBaseUrl: 'https://corsteno-treasure-hunt.pages.dev/' });
    expect(base).toBe('https://corsteno.com');
    const publicUrl = publicExperienceUrl('ruleta-demo', base);
    expect(publicUrl).toBe('https://corsteno.com/r/ruleta-demo');
    expect(publicUrl).not.toContain('treasure-hunt');
    expect(previewExperienceUrl('experience-1', 'org-1', 'https://crm.corsteno.com/app/experiences/experience-1', base))
      .toBe('https://corsteno.com/test/experiences/experience-1?org=org-1&returnTo=https%3A%2F%2Fcrm.corsteno.com%2Fapp%2Fexperiences%2Fexperience-1');
  });

  it('uses the canonical production runtime when no origin is configured', () => {
    expect(resolveRuntimeBaseUrl({ production: true })).toBe('https://corsteno.com');
    expect(() => resolveRuntimeApiBaseUrl({ production: true })).toThrow('VITE_API_URL');
    expect(() => resolveRuntimeApiBaseUrl({ production: true, configuredBaseUrl: 'http://127.0.0.1:8787' })).toThrow('localhost');
  });

  it('keeps production API configuration explicit', () => {
    expect(resolveRuntimeApiBaseUrl({ production: true, configuredBaseUrl: 'https://api.corsteno.com/' })).toBe('https://api.corsteno.com');
  });
});
