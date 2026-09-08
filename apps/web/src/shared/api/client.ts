const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

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
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? 'No se pudo cargar la información');
  }
  return response.json() as Promise<T>;
}
