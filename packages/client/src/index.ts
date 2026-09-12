import type {
  PublicProductResponse,
  PublicProductsResponse,
  PublicSiteContentResponse,
  PublicSiteResponse,
} from '@corsteno/types';

export type {
  PublicProduct,
  PublicProduct3D,
  PublicProductImage,
  PublicProductResponse,
  PublicProductsResponse,
  PublicSite,
  PublicSiteContent,
  PublicSiteContentResponse,
  PublicSiteResponse,
} from '@corsteno/types';

export type CorstenoErrorKind = 'not_found' | 'invalid_request' | 'network' | 'server';

export class CorstenoApiError extends Error {
  readonly kind: CorstenoErrorKind;
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { kind: CorstenoErrorKind; status: number; code?: string }) {
    super(message);
    this.name = 'CorstenoApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code ?? options.kind;
  }
}

export type CorstenoClientOptions = {
  baseUrl: string;
  siteKey: string;
  fetch?: typeof globalThis.fetch;
};

export type CorstenoRequestOptions = { signal?: AbortSignal };

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new CorstenoApiError('baseUrl is required', { kind: 'invalid_request', status: 0, code: 'INVALID_CONFIG' });
  try { return new URL(trimmed).toString().replace(/\/$/, ''); }
  catch { throw new CorstenoApiError('baseUrl must be an absolute URL', { kind: 'invalid_request', status: 0, code: 'INVALID_CONFIG' }); }
}

function apiError(response: Response, body: unknown) {
  const value = body && typeof body === 'object' ? body as { error?: { code?: unknown; message?: unknown } } : {};
  const error = value.error ?? {};
  const code = typeof error.code === 'string' ? error.code : response.status === 404 ? 'NOT_FOUND' : response.status < 500 ? 'INVALID_REQUEST' : 'SERVER_ERROR';
  const kind: CorstenoErrorKind = response.status === 404 ? 'not_found' : response.status < 500 ? 'invalid_request' : 'server';
  const message = typeof error.message === 'string' ? error.message : 'Corsteno request failed';
  return new CorstenoApiError(message, { kind, status: response.status, code });
}

async function parseBody(response: Response) {
  if (response.status === 204 || response.status === 304) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

export function createCorstenoClient(options: CorstenoClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!options.siteKey.trim()) throw new CorstenoApiError('siteKey is required', { kind: 'invalid_request', status: 0, code: 'INVALID_CONFIG' });
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new CorstenoApiError('fetch is not available', { kind: 'invalid_request', status: 0, code: 'FETCH_UNAVAILABLE' });
  const prefix = `/public/v1/sites/${encodeURIComponent(options.siteKey)}`;

  async function request<T>(path: string, requestOptions: CorstenoRequestOptions = {}) {
    let response: Response;
    try { response = await fetcher(`${baseUrl}${prefix}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, signal: requestOptions.signal }); }
    catch (cause) {
      if (cause instanceof CorstenoApiError) throw cause;
      throw new CorstenoApiError(cause instanceof Error ? cause.message : 'Network request failed', { kind: 'network', status: 0, code: 'NETWORK_ERROR' });
    }
    const body = await parseBody(response);
    if (!response.ok) throw apiError(response, body);
    return body as T;
  }

  return {
    getSite: (requestOptions?: CorstenoRequestOptions) => request<PublicSiteResponse>('', requestOptions),
    getContent: (requestOptions?: CorstenoRequestOptions) => request<PublicSiteContentResponse>('/content', requestOptions),
    getProducts: (requestOptions?: CorstenoRequestOptions) => request<PublicProductsResponse>('/products', requestOptions),
    getProduct: (productKey: string, requestOptions?: CorstenoRequestOptions) => request<PublicProductResponse>(`/products/${encodeURIComponent(productKey)}`, requestOptions),
  };
}

export type CorstenoClient = ReturnType<typeof createCorstenoClient>;
