import { describe, expect, it } from 'vitest';
import app from '../src';

describe('GET /health', () => {
  it('returns the API health contract', async () => {
    const response = await app.request('/health', undefined, {
      ENVIRONMENT: 'test',
      APP_VERSION: 'test',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'corsteno-api',
    });
  });
  it.each(['/dev/db-check', '/dev/events'])(
    'hides %s outside development',
    async (path) => {
      const response = await app.request(path, undefined, {
        ENVIRONMENT: 'production',
        APP_VERSION: '0.0.1',
      });
      expect(response.status).toBe(404);
    },
  );
});

describe('development CORS', () => {
  it.each([
    'https://localhost:5173',
    'https://localhost:5175',
    'http://localhost:5173',
    'http://localhost:5175',
  ])('answers preflight for %s', async (origin) => {
    const response = await app.request(
      '/v1/events',
      {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      },
      { ENVIRONMENT: 'development', APP_VERSION: 'test' },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true',
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'Authorization',
    );
  });

  it('does not allow arbitrary origins with credentials', async () => {
    const response = await app.request(
      '/v1/events/batch',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example',
          'Access-Control-Request-Method': 'POST',
        },
      },
      { ENVIRONMENT: 'development', APP_VERSION: 'test' },
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
