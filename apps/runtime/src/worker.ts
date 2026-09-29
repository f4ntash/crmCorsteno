type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type RuntimeEnvironment = {
  ASSETS: AssetsBinding;
};

type ExternalFetcher = (request: Request) => Promise<Response>;

const HUNTER_RUNTIME_ORIGIN = 'https://corsteno-treasure-hunt.pages.dev';

function upstreamPath(pathname: string) {
  return pathname === '/h/assets' || pathname.startsWith('/h/assets/')
    ? pathname.slice(2)
    : pathname;
}

function rewrittenAssetBody(body: string) {
  return body.replaceAll('/assets/', '/h/assets/');
}

export async function handleRuntimeRequest(
  request: Request,
  environment: RuntimeEnvironment,
  fetchExternal: ExternalFetcher = (upstreamRequest) => fetch(upstreamRequest),
) {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith('/h/')) return environment.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const targetUrl = new URL(upstreamPath(requestUrl.pathname) + requestUrl.search, HUNTER_RUNTIME_ORIGIN);
  const forwardedHeaders = new Headers();
  for (const header of ['accept', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(header);
    if (value) forwardedHeaders.set(header, value);
  }
  const upstreamRequest = new Request(targetUrl, { method: request.method, headers: forwardedHeaders, redirect: 'manual' });
  const upstreamResponse = await fetchExternal(upstreamRequest);

  const location = upstreamResponse.headers.get('Location');
  if (location) {
    const redirectUrl = new URL(location, targetUrl);
    if (redirectUrl.origin === HUNTER_RUNTIME_ORIGIN) {
      redirectUrl.host = requestUrl.host;
      if (redirectUrl.pathname.startsWith('/assets/')) redirectUrl.pathname = '/h' + redirectUrl.pathname;
      const headers = new Headers(upstreamResponse.headers);
      headers.set('Location', redirectUrl.toString());
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    }
  }

  if (request.method === 'HEAD' || !upstreamResponse.body || upstreamResponse.status === 204 || upstreamResponse.status === 304) {
    return upstreamResponse;
  }
  const contentType = upstreamResponse.headers.get('Content-Type') ?? '';
  if (!/(?:text\/(?:html|css|javascript)|application\/(?:javascript|ecmascript))/i.test(contentType)) {
    return upstreamResponse;
  }

  const originalBody = await upstreamResponse.clone().text();
  const body = rewrittenAssetBody(originalBody);
  if (body === originalBody) return upstreamResponse;

  const headers = new Headers(upstreamResponse.headers);
  for (const header of ['content-length', 'content-encoding', 'content-md5', 'etag']) headers.delete(header);
  return new Response(body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export default {
  fetch(request: Request, environment: RuntimeEnvironment) {
    return handleRuntimeRequest(request, environment);
  },
};
