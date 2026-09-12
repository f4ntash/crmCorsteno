import { describe, expect, it, vi } from 'vitest';
import { createCorstenoClient } from '../src';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('@corsteno/client', () => {
  it('creates a dependency-free client and requests the versioned public contract', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({ schemaVersion: 1, site: { key: 'site_demo1234', name: 'Demo' }, content: null, products: [] })));
    const client = createCorstenoClient({ baseUrl: 'https://api.example.com/', siteKey: 'site_demo1234', fetch: fetcher });
    await client.getSite();
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/public/v1/sites/site_demo1234', expect.objectContaining({ method: 'GET' }));
  });

  it('supports content, product list/detail and AbortSignal', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({ schemaVersion: 1, site: { key: 'site_demo1234', name: 'Demo' }, content: null, products: [] })));
    const client = createCorstenoClient({ baseUrl: 'https://api.example.com', siteKey: 'site_demo1234', fetch: fetcher });
    const controller = new AbortController();
    await client.getContent({ signal: controller.signal });
    await client.getProducts();
    await client.getProduct('lamp/nido');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/public/v1/sites/site_demo1234/content',
      'https://api.example.com/public/v1/sites/site_demo1234/products',
      'https://api.example.com/public/v1/sites/site_demo1234/products/lamp%2Fnido',
    ]);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: controller.signal }));
  });

  it('normalizes typed not-found and network errors', async () => {
    const notFound = createCorstenoClient({ baseUrl: 'https://api.example.com', siteKey: 'site_demo1234', fetch: vi.fn().mockResolvedValue(response({ error: { code: 'NOT_FOUND', message: 'Missing' } }, 404)) });
    await expect(notFound.getProducts()).rejects.toMatchObject({ kind: 'not_found', status: 404, code: 'NOT_FOUND' });
    const network = createCorstenoClient({ baseUrl: 'https://api.example.com', siteKey: 'site_demo1234', fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(network.getContent()).rejects.toMatchObject({ kind: 'network', code: 'NETWORK_ERROR' });
  });
});
