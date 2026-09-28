import { resolveRuntimeBaseUrl } from './runtimeBaseUrlConfig';

export { resolveRuntimeBaseUrl } from './runtimeBaseUrlConfig';

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
