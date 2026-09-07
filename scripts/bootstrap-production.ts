// @ts-nocheck
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../apps/api/src/auth/crypto';

type CommandRunner = (command: string, options: { stdio: 'inherit'; shell: true }) => unknown;

export function validateBootstrapSql(sql: string) {
  const insertCount = (sql.match(/INSERT INTO /g) ?? []).length;
  if (insertCount !== 8) throw new Error(`SQL de bootstrap inválido: se esperaban 8 INSERTs y se encontraron ${insertCount}.`);
  if (!sql.trim().endsWith(';')) throw new Error('SQL de bootstrap inválido: falta el punto y coma final.');
}

export function buildBootstrapSql(values: { adminEmail: string; adminHash: string; cosquinEmail: string; cosquinHash: string }) {
  const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const adminOrg = crypto.randomUUID(); const cosquinOrg = crypto.randomUUID();
  const project = crypto.randomUUID(); const application = crypto.randomUUID();
  const admin = crypto.randomUUID(); const cosquinUser = crypto.randomUUID();
  const adminMembership = crypto.randomUUID(); const cosquinMembership = crypto.randomUUID();
  const now = Date.now();
  return [
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(adminOrg)},'Corsteno','corsteno','active',${now},${now});`,
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(cosquinOrg)},'Cosquín Rock','cosquin-rock','active',${now},${now});`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${q(admin)},${q(values.adminEmail)},${q(values.adminEmail.toLowerCase())},'Corsteno Admin','active',${q(values.adminHash)},'super_admin',${now},${now});`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${q(cosquinUser)},${q(values.cosquinEmail)},${q(values.cosquinEmail.toLowerCase())},'Cosquín Rock','active',${q(values.cosquinHash)},'user',${now},${now});`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${q(adminMembership)},${q(admin)},${q(adminOrg)},'owner','active',${now},${now});`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${q(cosquinMembership)},${q(cosquinUser)},${q(cosquinOrg)},'viewer','active',${now},${now});`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${q(project)},${q(cosquinOrg)},'Cosquín Rock','cosquin-rock','active','Proyecto productivo Cosquín Rock',${now},${now});`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${q(application)},${q(cosquinOrg)},${q(project)},'Cosquín Web','cosquin-web','active','webar',${now},${now});`,
  ].join('\n');
}

export async function executeBootstrapSql(sql: string, runner: CommandRunner = execSync) {
  validateBootstrapSql(sql);
  const tempFile = path.join(os.tmpdir(), `corsteno-bootstrap-production-${Date.now()}.sql`);
  await writeFile(tempFile, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runner(`pnpm --filter @corsteno/api exec wrangler d1 execute corsteno-db --remote --file ${JSON.stringify(tempFile)}`, { stdio: 'inherit', shell: true });
  } finally {
    await unlink(tempFile).catch(() => undefined);
  }
}

export async function main() {
  const required = ['BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_COSQUIN_EMAIL', 'BOOTSTRAP_COSQUIN_PASSWORD'] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`Falta variable requerida: ${key}`);
  const execute = process.argv.includes('--execute');
  if (execute && process.env.ENVIRONMENT !== 'production') throw new Error('La ejecución productiva requiere ENVIRONMENT=production.');
  const [adminHash, cosquinHash] = await Promise.all([hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD!), hashPassword(process.env.BOOTSTRAP_COSQUIN_PASSWORD!)]);
  const statements = buildBootstrapSql({ adminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL!, adminHash, cosquinEmail: process.env.BOOTSTRAP_COSQUIN_EMAIL!, cosquinHash });
  if (!execute) {
    console.log('Preview de bootstrap productivo (no se ejecutó):');
    console.log(['- 2 organizations', '- 2 users', '- 2 memberships', '- 1 project', '- 1 application'].join('\n'));
    return;
  }
  await executeBootstrapSql(statements);
}

if (process.argv[1]?.endsWith('bootstrap-production.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });
