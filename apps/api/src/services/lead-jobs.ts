import { recordActivityBestEffort } from './activity';

export const LEAD_JOB_TYPES = ['FINDER', 'ENRICHER', 'SCORING', 'OUTREACH_PREPARATION'] as const;
export const LEAD_JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export const LEAD_JOB_LIMITS = { maxMetadataBytes: 8 * 1024, maxBatchSize: 500, maxActivePerOrganization: 3, testDefaultSteps: 25 } as const;
export type LeadJobType = typeof LEAD_JOB_TYPES[number];
type JobRow = { id: string; organization_id: string; type: LeadJobType; status: string; total: number; processed: number; succeeded: number; failed: number; metadata: string | null };
type HandlerContext = { db: D1Database; job: JobRow; report: (processed: number, succeeded: number, failed: number) => Promise<void>; isCancelled: () => Promise<boolean> };
type LeadJobHandler = (context: HandlerContext) => Promise<void>;

async function testFinderHandler({ job, report, isCancelled }: HandlerContext) {
  const parsed = job.metadata ? JSON.parse(job.metadata) as Record<string, unknown> : {};
  const steps = Math.min(Math.max(Number(parsed.limit) || LEAD_JOB_LIMITS.testDefaultSteps, 1), LEAD_JOB_LIMITS.maxBatchSize);
  let succeeded = 0; let failed = 0;
  for (let processed = 1; processed <= steps; processed += 1) {
    if (await isCancelled()) return;
    if (processed % 5 === 0) failed += 1; else succeeded += 1;
    await report(processed, succeeded, failed);
  }
}

const handlers = new Map<LeadJobType, LeadJobHandler>([['FINDER', testFinderHandler]]);
export function registerLeadJobHandler(type: LeadJobType, handler: LeadJobHandler) { handlers.set(type, handler); }

export async function runLeadJob(db: D1Database, organizationId: string, jobId: string, actorUserId: string | null = null) {
  const claimed = await db.prepare(`UPDATE lead_jobs SET status='RUNNING', started_at=?, updated_at=? WHERE id=? AND organization_id=? AND status='QUEUED'`).bind(Date.now(), Date.now(), jobId, organizationId).run();
  if (!claimed.meta.changes) return { status: 'ignored' as const };
  const job = await db.prepare('SELECT id,organization_id,type,status,total,processed,succeeded,failed,metadata FROM lead_jobs WHERE id=? AND organization_id=?').bind(jobId, organizationId).first<JobRow>();
  if (!job) return { status: 'ignored' as const };
  await recordActivityBestEffort(db, { organizationId, actorUserId }, { action: 'lead_job.started', resourceType: 'lead_job', resourceId: jobId, metadata: { type: job.type } });
  const report = async (processed: number, succeeded: number, failed: number) => { await db.prepare('UPDATE lead_jobs SET processed=?,succeeded=?,failed=?,progress=?,updated_at=? WHERE id=? AND organization_id=? AND status=\'RUNNING\'').bind(processed, succeeded, failed, Math.round((processed / Math.max(job.total, 1)) * 100), Date.now(), jobId, organizationId).run(); };
  const isCancelled = async () => Boolean((await db.prepare("SELECT 1 AS cancelled FROM lead_jobs WHERE id=? AND organization_id=? AND status='CANCELLED'").bind(jobId, organizationId).first()));
  try {
    const handler = handlers.get(job.type);
    if (!handler) throw new Error(`No hay un handler disponible para ${job.type}.`);
    await handler({ db, job, report, isCancelled });
    if (await isCancelled()) { await recordActivityBestEffort(db, { organizationId, actorUserId }, { action: 'lead_job.cancelled', resourceType: 'lead_job', resourceId: jobId, metadata: { type: job.type } }); return { status: 'cancelled' as const }; }
    await db.prepare("UPDATE lead_jobs SET status='COMPLETED', progress=100, finished_at=?, updated_at=? WHERE id=? AND organization_id=? AND status='RUNNING'").bind(Date.now(), Date.now(), jobId, organizationId).run();
    await recordActivityBestEffort(db, { organizationId, actorUserId }, { action: 'lead_job.completed', resourceType: 'lead_job', resourceId: jobId, metadata: { type: job.type } });
    return { status: 'completed' as const };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 500) : 'Error desconocido al procesar el job.';
    await db.prepare("UPDATE lead_jobs SET status='FAILED', error=?, finished_at=?, updated_at=? WHERE id=? AND organization_id=? AND status='RUNNING'").bind(message, Date.now(), Date.now(), jobId, organizationId).run();
    await recordActivityBestEffort(db, { organizationId, actorUserId }, { action: 'lead_job.failed', resourceType: 'lead_job', resourceId: jobId, metadata: { type: job.type, message } });
    return { status: 'failed' as const, error: message };
  }
}
