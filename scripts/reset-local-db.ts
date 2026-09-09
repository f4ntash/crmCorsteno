// LOCAL DEVELOPMENT ONLY — NEVER USE IN PRODUCTION
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function assertLocalOnly() {
  const environment = process.env.ENVIRONMENT?.toLowerCase();
  const cloudflareEnvironment = process.env.CLOUDFLARE_ENV?.toLowerCase();
  if (environment === 'production' || cloudflareEnvironment === 'production' || process.argv.includes('--remote') || process.argv.some((arg) => arg.startsWith('--remote='))) throw new Error('Refusing to reset D1: this command is local-only and cannot run in production or with --remote.');
}
function shellQuote(value: string) { return `"${value.replaceAll('"', '\\"')}"`; }
const wranglerBinary = path.resolve('apps/api/node_modules/.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
function wrangler(args: string[]) { return execSync(`${shellQuote(wranglerBinary)} ${args.map(shellQuote).join(' ')}`, { cwd: path.resolve('apps/api'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: true }); }
function quoteIdentifier(value: string) { return `"${value.replaceAll('"', '""')}"`; }

async function main() {
  assertLocalOnly();
  const raw = wrangler(['d1', 'execute', 'corsteno-db', '--local', '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_METADATA','d1_migrations') ORDER BY name", '--json']);
  const payload = JSON.parse(raw) as Array<{ results?: Array<{ name: string }> }>;
  const preferredOrder = ['experience_prize_inventory_events', 'experience_prize_inventory', 'roulette_prize_claims', 'prize_claims', 'experience_participation', 'experience_spins', 'experience_access_periods', 'subscription_experiences', 'subscription_periods', 'commercial_payments', 'commercial_grants', 'subscriptions', 'application_credentials', 'events', 'experiences', 'applications', 'crm_notes', 'crm_leads', 'crm_contacts', 'projects', 'memberships', 'auth_sessions', 'app_sessions', 'plans', 'prizes', 'users', 'organizations'];
  const names = (payload[0]?.results ?? []).map((row) => row.name).filter(Boolean);
  const drops = [...preferredOrder.filter((name) => names.includes(name)), ...names.filter((name) => !preferredOrder.includes(name)).reverse()].map(quoteIdentifier).map((name) => `DROP TABLE IF EXISTS ${name};`).join('\n');
  const file = path.join(os.tmpdir(), `corsteno-reset-local-${process.pid}.sql`);
  await writeFile(file, `PRAGMA foreign_keys=OFF;\n${drops}\nDELETE FROM d1_migrations;\nPRAGMA foreign_keys=ON;\n`, { encoding: 'utf8', flag: 'wx' });
  try { wrangler(['d1', 'execute', 'corsteno-db', '--local', '--file', file]); } finally { await unlink(file).catch(() => undefined); }
  wrangler(['d1', 'migrations', 'apply', 'corsteno-db', '--local']);
  console.log('Local D1 reset complete. Migrations reapplied with Wrangler --local.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
