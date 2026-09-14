// Restores only the historical global commercial catalog. Production requires explicit guards.
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EXPECTED_DATABASE = 'corsteno-db';
const EXPECTED_ORGANIZATION = 'corsteno';

const PLANS = [
  ['plan-starter', 'starter', 'Starter', 'Plan de referencia; precio comercial pendiente.', 'monthly', 1, 'NULL', 0, 'ARS', 1, 1, 'free', '2026-09-13 18:12:13', '2026-09-14 14:49:56'],
  ['plan-professional', 'professional', 'Professional', 'Plan de referencia; precio comercial pendiente.', 'monthly', 1, 'NULL', 10000000, 'ARS', 1, 1, 'unconfigured', '2026-09-13 18:12:13', '2026-09-14 14:49:12'],
  ['plan-enterprise', 'enterprise', 'Enterprise', 'Plan de referencia; precio comercial pendiente.', 'yearly', 1, 'NULL', 10000000, 'ARS', 1, 1, 'unconfigured', '2026-09-13 18:12:13', '2026-09-14 14:48:51'],
] as const;

function quote(value: string) { return `'${value.replaceAll("'", "''")}'`; }

function buildRestoreSql() {
  const values = PLANS.map(([id, code, name, description, interval, count, accessDays, price, currency, active, available, pricingMode, createdAt, updatedAt]) =>
    `(${quote(id)},${quote(code)},${quote(name)},${quote(description)},${quote(interval)},${count},${accessDays},${price},${quote(currency)},${active},${quote(createdAt)},${quote(updatedAt)},${available},${quote(pricingMode)})`,
  ).join(',\n');
  return `INSERT INTO plans (id,code,name,description,billing_interval,billing_interval_count,included_access_days,price_amount_minor,currency,active,created_at,updated_at,available_for_sale,pricing_mode) VALUES\n${values}\nON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,description=excluded.description,billing_interval=excluded.billing_interval,billing_interval_count=excluded.billing_interval_count,included_access_days=excluded.included_access_days,price_amount_minor=excluded.price_amount_minor,currency=excluded.currency,active=excluded.active,created_at=excluded.created_at,available_for_sale=excluded.available_for_sale,pricing_mode=excluded.pricing_mode,updated_at=excluded.updated_at;`;
}

function runJson(sql: string) {
  const command = `pnpm --dir apps/api exec wrangler d1 execute ${EXPECTED_DATABASE} --remote --json --command ${JSON.stringify(sql)}`;
  return JSON.parse(execSync(command, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] })) as Array<{ results?: Array<Record<string, unknown>> }>;
}

function assertProductionTarget(organizationSlug: string) {
  const result = runJson(`SELECT id,name,slug,status FROM organizations WHERE slug=${quote(organizationSlug)};`);
  const rows = result[0]?.results ?? [];
  if (rows.length !== 1 || rows[0]?.slug !== EXPECTED_ORGANIZATION || rows[0]?.status !== 'active') throw new Error('La organización Corsteno no está disponible como organización activa única.');
}

function assertNoConflictingPlanKeys() {
  const result = runJson('SELECT id,code FROM plans;');
  const expectedIds = new Set(PLANS.map(([id]) => id));
  const expectedCodes = new Set(PLANS.map(([, code]) => code));
  for (const row of result[0]?.results ?? []) {
    if (!expectedIds.has(String(row.id)) && expectedCodes.has(String(row.code))) throw new Error(`Existe un plan con código histórico pero ID distinto: ${String(row.code)}.`);
  }
}

export async function main() {
  if (!process.argv.includes('--execute') || !process.argv.includes('--confirm-production-restore')) throw new Error('Restauración bloqueada: requiere --execute y --confirm-production-restore.');
  if (process.env.ENVIRONMENT !== 'production') throw new Error('Restauración bloqueada: ENVIRONMENT debe ser production.');
  if (process.env.RESTORE_COMMERCIAL_PLANS_DATABASE !== EXPECTED_DATABASE) throw new Error(`Restauración bloqueada: RESTORE_COMMERCIAL_PLANS_DATABASE debe ser ${EXPECTED_DATABASE}.`);
  if (process.env.RESTORE_COMMERCIAL_PLANS_ORGANIZATION_SLUG !== EXPECTED_ORGANIZATION) throw new Error(`Restauración bloqueada: RESTORE_COMMERCIAL_PLANS_ORGANIZATION_SLUG debe ser ${EXPECTED_ORGANIZATION}.`);

  assertProductionTarget(EXPECTED_ORGANIZATION);
  assertNoConflictingPlanKeys();
  const file = path.join(os.tmpdir(), `corsteno-restore-commercial-plans-${process.pid}-${Date.now()}.sql`);
  await writeFile(file, buildRestoreSql(), { encoding: 'utf8', flag: 'wx' });
  try {
    execSync(`pnpm --dir apps/api exec wrangler d1 execute ${EXPECTED_DATABASE} --remote --file ${JSON.stringify(file)}`, { stdio: 'inherit', shell: true });
  } finally {
    await unlink(file).catch(() => undefined);
  }
}

if (process.argv[1]?.endsWith('restore-commercial-plans.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });
