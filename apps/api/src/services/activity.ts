const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'authorization',
  'deviceid',
  'sessionid',
  'anonymoususerid',
  'participantdeviceid',
  'participantsessionid',
]);
const MAX_METADATA_BYTES = 8 * 1024;

export type ActivityContext = {
  organizationId: string;
  actorUserId: string | null;
};

export type ActivityInput = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

function assertSafeMetadata(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertSafeMetadata);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) throw new Error('Activity metadata contains a forbidden field');
    assertSafeMetadata(child);
  }
}

export function serializeActivityMetadata(metadata: Record<string, unknown> = {}) {
  assertSafeMetadata(metadata);
  const serialized = JSON.stringify(metadata);
  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_METADATA_BYTES) throw new Error('Activity metadata is too large');
  return serialized;
}

export async function recordActivity(db: D1Database, context: ActivityContext, input: ActivityInput) {
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(input.action) || !/^[a-z][a-z0-9_.-]{1,79}$/.test(input.resourceType)) throw new Error('Invalid activity identity');
  const metadata = serializeActivityMetadata(input.metadata);
  await db.prepare('INSERT INTO organization_activity (id,organization_id,actor_user_id,action,resource_type,resource_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), context.organizationId, context.actorUserId, input.action, input.resourceType, input.resourceId ?? null, metadata, Date.now())
    .run();
}

export async function recordActivityBestEffort(db: D1Database, context: ActivityContext, input: ActivityInput) {
  await recordActivity(db, context, input).catch(() => undefined);
}
