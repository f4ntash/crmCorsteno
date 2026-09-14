const DEFAULT_DEV_RUNTIME_BASE_URL = 'http://localhost:5175';

export function resolveRuntimeBaseUrl(options: { production: boolean; configuredBaseUrl?: string }) {
  const configured = options.configuredBaseUrl?.trim();
  if (!configured) {
    if (options.production) throw new Error('VITE_RUNTIME_BASE_URL is required for a production build.');
    return DEFAULT_DEV_RUNTIME_BASE_URL;
  }
  const parsed = new URL(configured);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('VITE_RUNTIME_BASE_URL must be an absolute http(s) URL without credentials.');
  }
  if (options.production && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')) {
    throw new Error('VITE_RUNTIME_BASE_URL cannot point to localhost in a production build.');
  }
  return configured.replace(/\/+$/, '');
}

export const runtimeBaseUrl = resolveRuntimeBaseUrl({
  production: import.meta.env.PROD,
  configuredBaseUrl: import.meta.env.VITE_RUNTIME_BASE_URL,
});

export function publicExperienceUrl(slug: string, baseUrl = runtimeBaseUrl) {
  return `${baseUrl}/r/${encodeURIComponent(slug)}`;
}

export function previewExperienceUrl(id: string, organizationId: string, returnTo: string, baseUrl = runtimeBaseUrl) {
  return `${baseUrl}/test/experiences/${encodeURIComponent(id)}?org=${encodeURIComponent(organizationId)}&returnTo=${encodeURIComponent(returnTo)}`;
}
