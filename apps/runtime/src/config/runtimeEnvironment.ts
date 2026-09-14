const DEFAULT_DEV_API_BASE_URL = 'http://localhost:8787';

export function resolveRuntimeApiBaseUrl(options: { production: boolean; configuredBaseUrl?: string }) {
  const configured = options.configuredBaseUrl?.trim();
  if (!configured) {
    if (options.production) throw new Error('VITE_API_URL is required for a production runtime build.');
    return DEFAULT_DEV_API_BASE_URL;
  }
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('VITE_API_URL must be an absolute http(s) URL without credentials.');
  }
  if (options.production && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')) {
    throw new Error('VITE_API_URL cannot point to localhost in a production runtime build.');
  }
  return configured.replace(/\/+$/, '');
}

export const runtimeApiBaseUrl = resolveRuntimeApiBaseUrl({
  production: import.meta.env.PROD,
  configuredBaseUrl: import.meta.env.VITE_API_URL,
});
