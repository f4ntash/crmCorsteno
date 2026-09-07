import { execSync } from 'node:child_process';
import { hashToken, randomToken } from '../apps/api/src/auth/crypto';

async function main() {
  const index = process.argv.indexOf('--application');
  const application = index >= 0 ? process.argv[index + 1] : undefined;
  const execute = process.argv.includes('--execute');
  if (!application || application.startsWith('--'))
    throw new Error(
      'Uso: pnpm credentials:create-production --application <slug|id> [--execute]',
    );
  if (execute && process.env.ENVIRONMENT !== 'production')
    throw new Error('La ejecución productiva requiere ENVIRONMENT=production.');
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const secret = randomToken();
  const hash = await hashToken(secret);
  const sql = `INSERT INTO application_credentials (id,application_id,key_prefix,secret_hash,status,created_at) SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),id,'cor_app_prod_','${hash}','active',${Date.now()} FROM applications WHERE (id=${quote(application)} OR slug=${quote(application)}) AND status='active';`;
  if (!execute) {
    console.log(
      'Preview: no se creó credential. Ejecutar con ENVIRONMENT=production y --execute.',
    );
    return;
  }
  execSync(
    `pnpm --filter @corsteno/api exec wrangler d1 execute corsteno-db --remote --command ${JSON.stringify(sql)}`,
    { stdio: 'inherit', shell: true },
  );
  console.log(
    `Secret productivo (mostrar/guardar ahora; no volverá a mostrarse): ${secret}`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
