import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRuntimeRequest } from './worker';

afterEach(() => vi.restoreAllMocks());

describe('Corsteno runtime Worker routes', () => {
  it('keeps existing runtime paths on the configured assets binding', async () => {
    const assetResponse = new Response('roulette runtime');
    const assets = { fetch: vi.fn(async () => assetResponse) };
    const fetchExternal = vi.fn(async () => new Response('unexpected'));

    const response = await handleRuntimeRequest(
      new Request('https://corsteno.com/r/roulette-demo'),
      { ASSETS: assets },
      fetchExternal,
    );

    expect(response).toBe(assetResponse);
    expect(assets.fetch).toHaveBeenCalledOnce();
    expect(fetchExternal).not.toHaveBeenCalled();
  });

  it('proxies the same Hunter path and query to Pages without forwarding cookies or origin', async () => {
    const assets = { fetch: vi.fn(async () => new Response('unexpected')) };
    const fetchExternal = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(
      '<script src="/assets/index.js"></script>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: 'origin-etag' } },
    ));

    const response = await handleRuntimeRequest(
      new Request('https://corsteno.com/h/hunter-e2e-qa?source=pec', {
        headers: { Cookie: 'session=private', Origin: 'https://crm.corsteno.com' },
      }),
      { ASSETS: assets },
      fetchExternal,
    );
    const upstreamRequest = fetchExternal.mock.calls[0]?.[0];

    expect(upstreamRequest?.url).toBe('https://corsteno-treasure-hunt.pages.dev/h/hunter-e2e-qa?source=pec');
    expect(upstreamRequest?.headers.get('cookie')).toBeNull();
    expect(upstreamRequest?.headers.get('origin')).toBeNull();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('src="/h/assets/index.js"');
    expect(response.headers.get('etag')).toBeNull();
  });

  it('serves asset requests from Hunter Pages through the /h route', async () => {
    const assets = { fetch: vi.fn(async () => new Response('unexpected')) };
    const fetchExternal = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(
      'import("/assets/lazy-chunk.js"); const deps = ["assets/TraceARDemo.css"];',
      { status: 200, headers: { 'Content-Type': 'application/javascript', 'Content-Length': '30' } },
    ));

    const response = await handleRuntimeRequest(
      new Request('https://corsteno.com/h/assets/main.js'),
      { ASSETS: assets },
      fetchExternal,
    );
    const upstreamRequest = fetchExternal.mock.calls[0]?.[0];
    const body = await response.text();

    expect(upstreamRequest?.url).toBe('https://corsteno-treasure-hunt.pages.dev/assets/main.js');
    expect(body).toContain('import("/h/assets/lazy-chunk.js")');
    expect(body).toContain('"/h/assets/TraceARDemo.css"');
    expect(response.headers.get('content-length')).toBeNull();
  });

  it('preserves status codes from Pages responses', async () => {
    const assets = { fetch: vi.fn(async () => new Response('unexpected')) };
    const fetchExternal = vi.fn<(request: Request) => Promise<Response>>(async () => new Response('missing', { status: 404 }));

    const response = await handleRuntimeRequest(
      new Request('https://corsteno.com/h/unknown-hunt'),
      { ASSETS: assets },
      fetchExternal,
    );

    expect(response.status).toBe(404);
  });
});
