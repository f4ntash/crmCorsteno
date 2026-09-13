import { describe, expect, it } from 'vitest';
import { runLeadJob } from '../src/services/lead-jobs';

type Job = { id: string; organization_id: string; type: string; status: string; total: number; processed: number; succeeded: number; failed: number; metadata: string; error: string|null; started_at: number|null; finished_at: number|null };

function database(initial: Partial<Job> = {}) {
  const job: Job = { id: 'job-1', organization_id: 'org-a', type: 'FINDER', status: 'QUEUED', total: 5, processed: 0, succeeded: 0, failed: 0, metadata: JSON.stringify({ mode: 'test', limit: 5 }), error: null, started_at: null, finished_at: null, ...initial };
  let cancelAfter = -1;
  const db = { prepare(sql: string) { return { bind(...args: unknown[]) { return {
    async first<T>() {
      if (sql.includes('SELECT id,organization_id,type,status')) return { ...job } as T;
      if (sql.includes('SELECT 1 AS cancelled')) { if (cancelAfter >= 0 && job.processed >= cancelAfter) { job.status = 'CANCELLED'; return { cancelled: 1 } as T; } return null as T; }
      return null as T;
    },
    async run() {
      if (sql.includes("SET status='RUNNING'")) { if (job.status !== 'QUEUED' || args[3] !== job.organization_id) return { meta: { changes: 0 } }; job.status = 'RUNNING'; job.started_at = Date.now(); return { meta: { changes: 1 } }; }
      if (sql.includes('processed=?')) { job.processed = Number(args[0]); job.succeeded = Number(args[1]); job.failed = Number(args[2]); return { meta: { changes: 1 } }; }
      if (sql.includes("status='COMPLETED'")) { job.status = 'COMPLETED'; job.finished_at = Date.now(); return { meta: { changes: 1 } }; }
      if (sql.includes("status='FAILED'")) { job.status = 'FAILED'; job.error = String(args[0]); job.finished_at = Date.now(); return { meta: { changes: 1 } }; }
      if (sql.includes("status='CANCELLED'")) { job.status = 'CANCELLED'; job.finished_at = Date.now(); return { meta: { changes: 1 } }; }
      return { meta: { changes: 1 } };
    },
  }; } }; },
  setCancelAfter(value: number) { cancelAfter = value; },
  job,
  };
  return db as unknown as D1Database & { setCancelAfter: (value: number) => void; job: Job };
}

describe('LeadJobRunner', () => {
  it('claims a queued test job and completes it with progress metrics', async () => {
    const db = database();
    await expect(runLeadJob(db, 'org-a', 'job-1')).resolves.toMatchObject({ status: 'completed' });
    expect(db.job).toMatchObject({ status: 'COMPLETED', processed: 5, succeeded: 4, failed: 1, finished_at: expect.any(Number) });
  });

  it('does not process a job twice after the atomic claim', async () => {
    const db = database();
    await runLeadJob(db, 'org-a', 'job-1');
    await expect(runLeadJob(db, 'org-a', 'job-1')).resolves.toEqual({ status: 'ignored' });
    expect(db.job.processed).toBe(5);
  });

  it('stops when cancellation is observed between batches', async () => {
    const db = database(); db.setCancelAfter(2);
    await expect(runLeadJob(db, 'org-a', 'job-1')).resolves.toMatchObject({ status: 'cancelled' });
    expect(db.job.status).toBe('CANCELLED');
    expect(db.job.processed).toBe(2);
  });

  it('fails safely for a handler that is not registered', async () => {
    const db = database({ type: 'ENRICHER', metadata: JSON.stringify({ mode: 'test', limit: 2 }) });
    await expect(runLeadJob(db, 'org-a', 'job-1')).resolves.toMatchObject({ status: 'failed' });
    expect(db.job).toMatchObject({ status: 'FAILED', error: expect.stringContaining('handler') });
  });

  it('cannot claim a job from another organization', async () => {
    const db = database({ organization_id: 'org-b' });
    await expect(runLeadJob(db, 'org-a', 'job-1')).resolves.toEqual({ status: 'ignored' });
    expect(db.job.status).toBe('QUEUED');
  });
});
