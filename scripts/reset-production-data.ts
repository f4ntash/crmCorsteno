// Destructive production data reset. Schema, migrations and infrastructure are never dropped.
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type CommandRunner = (command: string, options: { stdio: 'inherit'; shell: true }) => unknown;

const EXPECTED_DATABASE = 'corsteno-db';
const EXPECTED_ADMIN = 'admin@corsteno.com';
const EXPECTED_ORGANIZATION = 'corsteno';

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildResetSql(adminEmail = EXPECTED_ADMIN, organizationSlug = EXPECTED_ORGANIZATION) {
  const email = adminEmail.trim().toLowerCase();
  const slug = organizationSlug.trim().toLowerCase();
  return [
    // Delete children before their referenced business records. Foreign keys remain enabled.
    'DELETE FROM app_sessions;',
    'DELETE FROM auth_sessions;',
    'DELETE FROM application_credentials;',
    'DELETE FROM prize_claims;',
    'DELETE FROM roulette_prize_claims;',
    'DELETE FROM experience_prize_inventory_events;',
    'DELETE FROM experience_prize_inventory;',
    'DELETE FROM experience_participation;',
    'DELETE FROM experience_spins;',
    'DELETE FROM experience_access_periods;',
    'DELETE FROM subscription_experiences;',
    'DELETE FROM catalog_product_images;',
    'DELETE FROM catalog_published_product_images;',
    'DELETE FROM catalog_published_experience_products;',
    'DELETE FROM catalog_experience_products;',
    'DELETE FROM channel_content;',
    'DELETE FROM channel_products;',
    'DELETE FROM channel_published_products;',
    'DELETE FROM experience_channels;',
    'DELETE FROM product_3d_config;',
    'DELETE FROM product_images;',
    'DELETE FROM product_published_images;',
    'DELETE FROM catalog_products;',
    'DELETE FROM catalog_published_products;',
    'DELETE FROM products;',
    'DELETE FROM channels;',
    'DELETE FROM experiences;',
    'DELETE FROM commercial_grants;',
    'DELETE FROM subscription_periods;',
    'DELETE FROM commercial_payments;',
    'DELETE FROM subscriptions;',
    'DELETE FROM plans;',
    'DELETE FROM events;',
    'DELETE FROM applications;',
    'DELETE FROM projects;',
    'DELETE FROM organization_activity;',
    'DELETE FROM organization_assets;',
    'DELETE FROM crm_notes;',
    'DELETE FROM crm_contacts;',
    'DELETE FROM crm_leads;',
    'DELETE FROM leads;',
    'DELETE FROM lead_jobs;',
    `DELETE FROM memberships WHERE NOT (user_id=(SELECT id FROM users WHERE lower(email)=${quote(email)}) AND organization_id=(SELECT id FROM organizations WHERE slug=${quote(slug)}) AND role='owner' AND status='active');`,
    `DELETE FROM users WHERE lower(email)<>${quote(email)};`,
    `DELETE FROM organizations WHERE slug<>${quote(slug)};`,
  ].join('\n');
}

function assertPreservationTargets(adminEmail: string, organizationSlug: string) {
  const sql = `SELECT (SELECT COUNT(*) FROM users WHERE lower(email)=${quote(adminEmail)}) AS admin_count, (SELECT COUNT(*) FROM users WHERE lower(email)=${quote(adminEmail)} AND status='active' AND platform_role='super_admin') AS admin_ok, (SELECT COUNT(*) FROM organizations WHERE slug=${quote(organizationSlug)}) AS organization_count, (SELECT COUNT(*) FROM organizations WHERE slug=${quote(organizationSlug)} AND status='active') AS organization_ok, (SELECT COUNT(*) FROM memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE lower(u.email)=${quote(adminEmail)} AND o.slug=${quote(organizationSlug)} AND u.status='active' AND u.platform_role='super_admin' AND m.role='owner' AND m.status='active') AS membership_count;`;
  const command = `pnpm --dir apps/api exec wrangler d1 execute ${EXPECTED_DATABASE} --remote --json --command ${JSON.stringify(sql)}`;
  const output = execSync(command, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] });
  const result = JSON.parse(output) as Array<{ results?: Array<Record<string, number>> }>;
  const row = result[0]?.results?.[0];
  if (!row || row.admin_count !== 1 || row.admin_ok !== 1 || row.organization_count !== 1 || row.organization_ok !== 1 || row.membership_count !== 1) {
    throw new Error('Precondiciones de preservación no satisfechas; no se ejecutó ningún borrado.');
  }
}

export async function executeResetSql(sql: string, runner: CommandRunner = execSync) {
  const tempFile = path.join(os.tmpdir(), `corsteno-reset-data-${process.pid}-${Date.now()}.sql`);
  await writeFile(tempFile, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runner(`pnpm --dir apps/api exec wrangler d1 execute ${EXPECTED_DATABASE} --remote --file ${JSON.stringify(tempFile)}`, { stdio: 'inherit', shell: true });
  } finally {
    await unlink(tempFile).catch(() => undefined);
  }
}

export async function main() {
  const execute = process.argv.includes('--execute');
  const confirmed = process.argv.includes('--confirm-production-reset');
  const environment = process.env.ENVIRONMENT;
  const adminEmail = process.env.RESET_PRODUCTION_ADMIN_EMAIL?.trim().toLowerCase();
  const organizationSlug = process.env.RESET_PRODUCTION_ORGANIZATION_SLUG?.trim().toLowerCase();
  const database = process.env.RESET_PRODUCTION_DATABASE?.trim();

  if (!execute) throw new Error('Reset destructivo bloqueado: falta --execute.');
  if (!confirmed) throw new Error('Reset destructivo bloqueado: falta --confirm-production-reset.');
  if (environment !== 'production') throw new Error('Reset destructivo bloqueado: ENVIRONMENT debe ser production.');
  if (database !== EXPECTED_DATABASE) throw new Error(`Reset destructivo bloqueado: RESET_PRODUCTION_DATABASE debe ser ${EXPECTED_DATABASE}.`);
  if (adminEmail !== EXPECTED_ADMIN) throw new Error(`Reset destructivo bloqueado: RESET_PRODUCTION_ADMIN_EMAIL debe ser ${EXPECTED_ADMIN}.`);
  if (organizationSlug !== EXPECTED_ORGANIZATION) throw new Error(`Reset destructivo bloqueado: RESET_PRODUCTION_ORGANIZATION_SLUG debe ser ${EXPECTED_ORGANIZATION}.`);

  assertPreservationTargets(adminEmail, organizationSlug);
  await executeResetSql(buildResetSql(adminEmail, organizationSlug));
  console.log('Reset de datos productivos aplicado. El esquema, migraciones e infraestructura no fueron modificados.');
}

if (process.argv[1]?.endsWith('reset-production-data.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });
