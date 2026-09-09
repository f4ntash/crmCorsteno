// LOCAL DEVELOPMENT ONLY — NEVER USE IN PRODUCTION
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../apps/api/src/auth/crypto';

const email = 'admin@admin.com';
const password = 'password';
const organizationId = '00000000-0000-4000-8000-000000000060';
const userId = '00000000-0000-4000-8000-000000000061';
const membershipId = '00000000-0000-4000-8000-000000000062';
const demoOrganizationId = '00000000-0000-4000-8000-000000000063';
const demoUserId = '00000000-0000-4000-8000-000000000064';
const demoMembershipId = '00000000-0000-4000-8000-000000000065';
const demoProjectId = '00000000-0000-4000-8000-000000000066';
const demoApplicationId = '00000000-0000-4000-8000-000000000067';
const starterExperienceId = '00000000-0000-4000-8000-000000000068';
const professionalExperienceId = '00000000-0000-4000-8000-000000000069';
const starterSubscriptionId = '00000000-0000-4000-8000-000000000070';
const professionalSubscriptionId = '00000000-0000-4000-8000-000000000071';
const freePlanId = '00000000-0000-4000-8000-000000000072';
const freeSubscriptionId = '00000000-0000-4000-8000-000000000073';

function assertLocalOnly() {
  const environment = process.env.ENVIRONMENT?.toLowerCase();
  const cloudflareEnvironment = process.env.CLOUDFLARE_ENV?.toLowerCase();
  if (environment === 'production' || cloudflareEnvironment === 'production' || process.argv.some((arg) => arg.includes('--remote'))) {
    throw new Error('Refusing to create the local platform admin in a production or remote environment.');
  }
}

function quote(value: string) { return `'${value.replaceAll("'", "''")}'`; }

async function main() {
  assertLocalOnly();
  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const startsAt = new Date(now - 7 * 86400000).toISOString();
  const currentEnd = new Date(now + 23 * 86400000).toISOString();
  const grantEnd = new Date(now + 53 * 86400000).toISOString();
  const config = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'demo-prize-shirt', name: 'Remera', redemption: { enabled: true } }, { id: 'demo-prize-none', name: 'Sin premio' }], segments: [{ id: 'demo-seg-1', color: '#D6B25E', prizeId: 'demo-prize-shirt' }, { id: 'demo-seg-2', color: '#79A7D3', prizeId: 'demo-prize-none' }, { id: 'demo-seg-3', color: '#9BC47D', prizeId: 'demo-prize-shirt' }, { id: 'demo-seg-4', color: '#C0A1D8', prizeId: 'demo-prize-none' }, { id: 'demo-seg-5', color: '#D88C8C', prizeId: 'demo-prize-shirt' }, { id: 'demo-seg-6', color: '#6FB6A8', prizeId: 'demo-prize-none' }] });
  const sql = [
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(organizationId)},'Corsteno Local','corsteno-local','active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${quote(userId)},${quote(email)},${quote(email)},'Local Platform Admin','active',${quote(passwordHash)},'super_admin',${now},${now}) ON CONFLICT(email_normalized) DO UPDATE SET name=excluded.name,status='active',password_hash=excluded.password_hash,platform_role='super_admin',updated_at=excluded.updated_at;`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${quote(membershipId)},(SELECT id FROM users WHERE email_normalized=${quote(email)}),${quote(organizationId)},'owner','active',${now},${now}) ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(demoOrganizationId)},'Cliente Demo Corsteno','cliente-demo-corsteno','active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${quote(demoUserId)},'user@user.com','user@user.com','Demo Organization Admin','active',${quote(passwordHash)},'user',${now},${now}) ON CONFLICT(email_normalized) DO UPDATE SET name=excluded.name,status='active',password_hash=excluded.password_hash,platform_role='user',updated_at=excluded.updated_at;`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${quote(demoMembershipId)},(SELECT id FROM users WHERE email_normalized='user@user.com'),${quote(demoOrganizationId)},'admin','active',${now},${now}) ON CONFLICT(user_id,organization_id) DO UPDATE SET role='admin',status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${quote(demoProjectId)},${quote(demoOrganizationId)},'Cliente Demo · Activación','cliente-demo-activacion','active','Datos locales de demostración comercial',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${quote(demoApplicationId)},${quote(demoOrganizationId)},${quote(demoProjectId)},'Ruleta Demo','ruleta-demo','active','roulette',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='active',application_type='roulette',updated_at=excluded.updated_at;`,
    `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,created_at,updated_at,project_id,application_id) VALUES (${quote(starterExperienceId)},${quote(demoOrganizationId)},'Ruleta Demo Starter','ruleta-demo-starter','roulette','published',1,${quote(config)},${quote(config)},NULL,NULL,${now},${now},${quote(demoProjectId)},${quote(demoApplicationId)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='published',draft_config=excluded.draft_config,published_config=excluded.published_config,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    `INSERT INTO experiences (id,organization_id,name,slug,type,status,schema_version,draft_config,published_config,starts_at,ends_at,created_at,updated_at,project_id,application_id) VALUES (${quote(professionalExperienceId)},${quote(demoOrganizationId)},'Ruleta Demo Professional','ruleta-demo-professional','roulette','published',1,${quote(config)},${quote(config)},NULL,NULL,${now},${now},${quote(demoProjectId)},${quote(demoApplicationId)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status='published',draft_config=excluded.draft_config,published_config=excluded.published_config,project_id=excluded.project_id,application_id=excluded.application_id,updated_at=excluded.updated_at;`,
    `UPDATE plans SET pricing_mode='paid',price_amount_minor=19900,currency='ARS',available_for_sale=1,active=1,description='Demo local Starter · no es precio de producción',updated_at=CURRENT_TIMESTAMP WHERE code='starter';`,
    `UPDATE plans SET pricing_mode='paid',price_amount_minor=49900,currency='ARS',available_for_sale=1,active=1,description='Demo local Professional · no es precio de producción',updated_at=CURRENT_TIMESTAMP WHERE code='professional';`,
    `INSERT INTO plans (id,code,name,description,billing_interval,billing_interval_count,price_amount_minor,currency,active,available_for_sale,pricing_mode) VALUES (${quote(freePlanId)},'local-free-demo','Gratis Demo Local','Solo datos de demostración local.','monthly',1,0,'ARS',1,1,'free') ON CONFLICT(id) DO UPDATE SET active=1,available_for_sale=1,pricing_mode='free',price_amount_minor=0,updated_at=CURRENT_TIMESTAMP;`,
    `INSERT INTO subscriptions (id,organization_id,plan_id,status,starts_at,current_period_start,current_period_end,cancel_at_period_end,price_amount_minor,currency,billing_interval,billing_interval_count,included_access_days,feature_entitlements_json) VALUES (${quote(starterSubscriptionId)},${quote(demoOrganizationId)},(SELECT id FROM plans WHERE code='starter'),'active',${quote(startsAt)},${quote(startsAt)},${quote(currentEnd)},0,19900,'ARS','monthly',1,NULL,'{"features":["roulette","standard_3d","result_cta","inventory","participation_limits","basic_analytics"],"maxActiveExperiences":1}') ON CONFLICT(id) DO UPDATE SET current_period_end=excluded.current_period_end,updated_at=CURRENT_TIMESTAMP;`,
    `INSERT INTO subscriptions (id,organization_id,plan_id,status,starts_at,current_period_start,current_period_end,cancel_at_period_end,price_amount_minor,currency,billing_interval,billing_interval_count,included_access_days,feature_entitlements_json) VALUES (${quote(professionalSubscriptionId)},${quote(demoOrganizationId)},(SELECT id FROM plans WHERE code='professional'),'active',${quote(startsAt)},${quote(startsAt)},${quote(currentEnd)},0,49900,'ARS','monthly',1,NULL,'{"features":["roulette","standard_3d","result_cta","inventory","participation_limits","basic_analytics","webxr_ar","custom_branding","redemption_claims","advanced_analytics","premium_effects"],"maxActiveExperiences":3}') ON CONFLICT(id) DO UPDATE SET current_period_end=excluded.current_period_end,updated_at=CURRENT_TIMESTAMP;`,
    `INSERT INTO subscriptions (id,organization_id,plan_id,status,starts_at,current_period_start,current_period_end,cancel_at_period_end,price_amount_minor,currency,billing_interval,billing_interval_count,included_access_days,feature_entitlements_json) VALUES (${quote(freeSubscriptionId)},${quote(demoOrganizationId)},${quote(freePlanId)},'active',${quote(startsAt)},${quote(startsAt)},${quote(currentEnd)},0,0,'ARS','monthly',1,NULL,'{"features":["roulette","standard_3d","result_cta","inventory","participation_limits","basic_analytics"],"maxActiveExperiences":1}') ON CONFLICT(id) DO UPDATE SET current_period_end=excluded.current_period_end,updated_at=CURRENT_TIMESTAMP;`,
    `INSERT OR IGNORE INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status) VALUES ('00000000-0000-4000-8000-000000000074',${quote(starterSubscriptionId)},${quote(demoOrganizationId)},${quote(startsAt)},${quote(currentEnd)},'active');`,
    `INSERT OR IGNORE INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status) VALUES ('00000000-0000-4000-8000-000000000075',${quote(professionalSubscriptionId)},${quote(demoOrganizationId)},${quote(startsAt)},${quote(currentEnd)},'active');`,
    `INSERT OR IGNORE INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status) VALUES ('00000000-0000-4000-8000-000000000076',${quote(freeSubscriptionId)},${quote(demoOrganizationId)},${quote(startsAt)},${quote(currentEnd)},'active');`,
    `INSERT OR IGNORE INTO subscription_experiences (subscription_id,experience_id,organization_id) VALUES (${quote(starterSubscriptionId)},${quote(starterExperienceId)},${quote(demoOrganizationId)});`,
    `INSERT OR IGNORE INTO subscription_experiences (subscription_id,experience_id,organization_id) VALUES (${quote(professionalSubscriptionId)},${quote(professionalExperienceId)},${quote(demoOrganizationId)});`,
    `INSERT OR IGNORE INTO subscription_experiences (subscription_id,experience_id,organization_id) VALUES (${quote(freeSubscriptionId)},${quote(starterExperienceId)},${quote(demoOrganizationId)});`,
    `INSERT OR IGNORE INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,subscription_period_id) VALUES ('00000000-0000-4000-8000-000000000077',${quote(starterExperienceId)},${quote(demoOrganizationId)},${quote(startsAt)},${quote(currentEnd)},'subscription',${quote(demoUserId)},'Demo local Starter','00000000-0000-4000-8000-000000000074');`,
    `INSERT OR IGNORE INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,subscription_period_id) VALUES ('00000000-0000-4000-8000-000000000078',${quote(professionalExperienceId)},${quote(demoOrganizationId)},${quote(startsAt)},${quote(currentEnd)},'subscription',${quote(demoUserId)},'Demo local Professional','00000000-0000-4000-8000-000000000075');`,
    `INSERT OR IGNORE INTO commercial_payments (id,organization_id,subscription_id,payment_source,payment_method,status,amount_minor,currency,reference,note,created_by,idempotency_key,paid_at) VALUES ('00000000-0000-4000-8000-000000000079',${quote(demoOrganizationId)},${quote(starterSubscriptionId)},'offline','cash','approved',19900,'ARS','CAJA-DEMO-001','Pago demo local en efectivo',${quote(userId)},'seed-demo-cash',${quote(startsAt)});`,
    `INSERT OR IGNORE INTO commercial_payments (id,organization_id,subscription_id,payment_source,payment_method,status,amount_minor,currency,reference,note,created_by,idempotency_key,paid_at) VALUES ('00000000-0000-4000-8000-000000000080',${quote(demoOrganizationId)},${quote(professionalSubscriptionId)},'offline','bank_transfer','approved',49900,'ARS','TRANSFER-DEMO-001','Transferencia demo local',${quote(userId)},'seed-demo-transfer',${quote(startsAt)});`,
    `INSERT OR IGNORE INTO commercial_grants (id,organization_id,subscription_id,grant_type,starts_at,ends_at,note,created_by) VALUES ('00000000-0000-4000-8000-000000000081',${quote(demoOrganizationId)},${quote(professionalSubscriptionId)},'courtesy',${quote(currentEnd)},${quote(grantEnd)},'30 días de cortesía demo local',${quote(userId)});`,
    `INSERT OR IGNORE INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,commercial_grant_id) VALUES ('00000000-0000-4000-8000-000000000082',${quote(professionalExperienceId)},${quote(demoOrganizationId)},${quote(currentEnd)},${quote(grantEnd)},'promotion',${quote(userId)},'30 días de cortesía demo local','00000000-0000-4000-8000-000000000081');`,
  ].join('\n');
  const file = path.join(os.tmpdir(), `corsteno-seed-local-platform-admin-${process.pid}.sql`);
  await writeFile(file, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    execSync(`pnpm --dir apps/api exec wrangler d1 execute corsteno-db --local --file "${file}"`, { stdio: 'inherit', shell: true });
  } finally {
    await unlink(file).catch(() => undefined);
  }
  console.log(`Seeded local platform admin ${email} in Corsteno Local (super_admin).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
