import { runLeadJob } from './lead-jobs';

export type LeadJobMessage = { version: 1; jobId: string; organizationId: string };
type QueueMessage = { body: unknown; ack: () => void; retry: () => void };
type QueueBatch = { messages: readonly QueueMessage[] };
export function parseLeadJobMessage(value: unknown): LeadJobMessage | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.jobId === 'string' && typeof item.organizationId === 'string' && item.jobId.length <= 100 && item.organizationId.length <= 100
    ? { version: 1, jobId: item.jobId, organizationId: item.organizationId } : null;
}
export async function consumeLeadJobBatch(batch: QueueBatch, db: D1Database, log: (event: string, details: Record<string, unknown>) => void = () => undefined) {
  for (const message of batch.messages) {
    const payload = parseLeadJobMessage(message.body);
    if (!payload) { log('lead_job.message_invalid', {}); message.ack(); continue; }
    log('lead_job.message_received', payload);
    try {
      const result = await runLeadJob(db, payload.organizationId, payload.jobId);
      log(result.status === 'ignored' ? 'lead_job.message_stale' : `lead_job.${result.status}`, payload);
      message.ack();
    } catch (error) {
      log('lead_job.retry', { ...payload, error: error instanceof Error ? error.message.slice(0, 300) : 'Transient queue processing error' });
      message.retry();
    }
  }
}
