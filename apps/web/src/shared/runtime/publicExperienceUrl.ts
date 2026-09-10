const DEFAULT_RUNTIME_BASE_URL = 'http://localhost:5175';

export const runtimeBaseUrl = (
  import.meta.env.VITE_RUNTIME_BASE_URL?.trim() || DEFAULT_RUNTIME_BASE_URL
).replace(/\/+$/, '');

export function publicExperienceUrl(slug: string) {
  return `${runtimeBaseUrl}/r/${encodeURIComponent(slug)}`;
}
