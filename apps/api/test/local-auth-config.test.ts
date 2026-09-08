import { describe, expect, it } from 'vitest';
import app from '../src';

describe('local authentication CORS contract', () => {
  it('allows the local CRM origin with credentials and required methods', async () => {
    const response = await app.request('/auth/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type,x-organization-id',
      },
    }, { ENVIRONMENT: 'development', APP_VERSION: 'test' });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });

  it('does not allow an arbitrary origin with credentials', async () => {
    const response = await app.request('/auth/login', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    }, { ENVIRONMENT: 'development', APP_VERSION: 'test' });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
