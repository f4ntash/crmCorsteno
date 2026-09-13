import { describe, expect, it, vi } from 'vitest';
import { consumeLeadJobBatch, parseLeadJobMessage } from '../src/services/lead-queue';

describe('Lead queue adapter', () => {
  it('accepts only the minimal versioned message', () => { expect(parseLeadJobMessage({ version: 1, jobId: 'j', organizationId: 'o' })).toEqual({ version: 1, jobId: 'j', organizationId: 'o' }); expect(parseLeadJobMessage({ version: 2, jobId: 'j', organizationId: 'o' })).toBeNull(); expect(parseLeadJobMessage({ version: 1, jobId: 'j' })).toBeNull(); });
  it('acknowledges invalid and stale messages without retrying them', async () => { const ack = vi.fn(); const retry = vi.fn(); const db = { prepare() { return { bind() { return { async run() { return { meta: { changes: 0 } }; }, async first() { return null; } }; } }; } } as unknown as D1Database; await consumeLeadJobBatch({ messages: [{ body: { invalid: true }, ack, retry }] }, db); expect(ack).toHaveBeenCalledOnce(); expect(retry).not.toHaveBeenCalled(); });
  it('retries unexpected transient adapter errors', async () => { const ack = vi.fn(); const retry = vi.fn(); const db = { prepare() { throw new Error('temporary database failure'); } } as unknown as D1Database; await consumeLeadJobBatch({ messages: [{ body: { version: 1, jobId: 'j', organizationId: 'o' }, ack, retry }] }, db); expect(retry).toHaveBeenCalledOnce(); expect(ack).not.toHaveBeenCalled(); });
});
