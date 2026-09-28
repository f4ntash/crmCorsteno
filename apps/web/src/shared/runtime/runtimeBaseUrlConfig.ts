const DEFAULT_DEV_RUNTIME_BASE_URL = 'http://localhost:5175';
const DEFAULT_PRODUCTION_RUNTIME_BASE_URL = 'https://corsteno.com';

export function resolveRuntimeBaseUrl(options: { production: boolean; configuredBaseUrl?: string }) {
  if (options.production) return DEFAULT_PRODUCTION_RUNTIME_BASE_URL;

  const configured = options.configuredBaseUrl?.trim();
  if (!configured) return DEFAULT_DEV_RUNTIME_BASE_URL;

  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('VITE_RUNTIME_BASE_URL must be an absolute http(s) URL without credentials.');
  }
  if (options.production && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')) {
    throw new Error('VITE_RUNTIME_BASE_URL cannot point to localhost in a production build.');
  }

  // Treasure Hunt is deployed as a separate site. Its host does not serve the
  // shared /r/:slug runtime routes used by Roulette and the other experiences.
  if (parsed.hostname.toLowerCase().includes('treasure-hunt')) {
    return options.production ? DEFAULT_PRODUCTION_RUNTIME_BASE_URL : DEFAULT_DEV_RUNTIME_BASE_URL;
  }

  return configured.replace(/\/+$/, '');
}
