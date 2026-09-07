import type { HealthResponse } from '@corsteno/types';
import type { Context } from 'hono';

export function health(c: Context): Response {
  const body: HealthResponse = {
    status: 'ok',
    service: 'corsteno-api',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    version: c.env.APP_VERSION,
  };
  return c.json(body);
}
