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
  const sql = [
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${quote(organizationId)},'Corsteno Local','corsteno-local','active',${now},${now}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,status='active',updated_at=excluded.updated_at;`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${quote(userId)},${quote(email)},${quote(email)},'Local Platform Admin','active',${quote(passwordHash)},'super_admin',${now},${now}) ON CONFLICT(email_normalized) DO UPDATE SET name=excluded.name,status='active',password_hash=excluded.password_hash,platform_role='super_admin',updated_at=excluded.updated_at;`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${quote(membershipId)},(SELECT id FROM users WHERE email_normalized=${quote(email)}),${quote(organizationId)},'owner','active',${now},${now}) ON CONFLICT(user_id,organization_id) DO UPDATE SET role='owner',status='active',updated_at=excluded.updated_at;`,
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
