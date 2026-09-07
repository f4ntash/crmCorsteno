import { execSync } from 'node:child_process';
import { hashPassword } from '../apps/api/src/auth/crypto';

async function main() {
  const required = [
    'BOOTSTRAP_ADMIN_EMAIL',
    'BOOTSTRAP_ADMIN_PASSWORD',
    'BOOTSTRAP_COSQUIN_EMAIL',
    'BOOTSTRAP_COSQUIN_PASSWORD',
  ] as const;
  for (const key of required)
    if (!process.env[key]) throw new Error(`Falta variable requerida: ${key}`);
  const execute = process.argv.includes('--execute');
  if (execute && process.env.ENVIRONMENT !== 'production')
    throw new Error('La ejecución productiva requiere ENVIRONMENT=production.');
  const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const adminOrg = crypto.randomUUID();
  const cosquinOrg = crypto.randomUUID();
  const project = crypto.randomUUID();
  const application = crypto.randomUUID();
  const admin = crypto.randomUUID();
  const cosquinUser = crypto.randomUUID();
  const adminMembership = crypto.randomUUID();
  const cosquinMembership = crypto.randomUUID();
  const now = Date.now();
  const [adminHash, cosquinHash] = await Promise.all([
    hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD!),
    hashPassword(process.env.BOOTSTRAP_COSQUIN_PASSWORD!),
  ]);
  const statements = [
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(adminOrg)},'Corsteno','corsteno','active',${now},${now});`,
    `INSERT INTO organizations (id,name,slug,status,created_at,updated_at) VALUES (${q(cosquinOrg)},'Cosquín Rock','cosquin-rock','active',${now},${now});`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${q(admin)},${q(process.env.BOOTSTRAP_ADMIN_EMAIL!)},${q(process.env.BOOTSTRAP_ADMIN_EMAIL!.toLowerCase())},'Corsteno Admin','active',${q(adminHash)},'super_admin',${now},${now});`,
    `INSERT INTO users (id,email,email_normalized,name,status,password_hash,platform_role,created_at,updated_at) VALUES (${q(cosquinUser)},${q(process.env.BOOTSTRAP_COSQUIN_EMAIL!)},${q(process.env.BOOTSTRAP_COSQUIN_EMAIL!.toLowerCase())},'Cosquín Rock','active',${q(cosquinHash)},'user',${now},${now});`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${q(adminMembership)},${q(admin)},${q(adminOrg)},'owner','active',${now},${now});`,
    `INSERT INTO memberships (id,user_id,organization_id,role,status,created_at,updated_at) VALUES (${q(cosquinMembership)},${q(cosquinUser)},${q(cosquinOrg)},'viewer','active',${now},${now});`,
    `INSERT INTO projects (id,organization_id,name,slug,status,description,created_at,updated_at) VALUES (${q(project)},${q(cosquinOrg)},'Cosquín Rock','cosquin-rock','active','Proyecto productivo Cosquín Rock',${now},${now});`,
    `INSERT INTO applications (id,organization_id,project_id,name,slug,status,application_type,created_at,updated_at) VALUES (${q(application)},${q(cosquinOrg)},${q(project)},'Cosquín Web','cosquin-web','active','webar',${now},${now});`,
  ].join('\n');
  if (!execute) {
    console.log('Preview de bootstrap productivo (no se ejecutó):\n');
    console.log(statements);
    return;
  }
  execSync(
    `wrangler d1 execute corsteno-db --remote --command ${JSON.stringify(statements)}`,
    { stdio: 'inherit', shell: true },
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
