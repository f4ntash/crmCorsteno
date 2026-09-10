const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, organizationId?: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (organizationId) headers.set('X-Organization-Id', organizationId);
  const response = await fetch(apiBaseUrl + path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; issues?: unknown } } | null;
    throw new ApiError(payload?.error?.message ?? 'No se pudo cargar la información', payload?.error?.issues);
  }
  return response.json() as Promise<T>;
}
