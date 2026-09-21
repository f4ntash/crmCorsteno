/**
 * Creates an application credential without ever persisting the plaintext
 * secret. The secret is printed once only after the D1 write succeeds.
 *
 * Local example:
 *   pnpm credentials:create --local --application tus-estaciones --execute
 *
 * Remote writes require the same explicit production guards used by the
 * isolated demo seeds. This script is intentionally never run by CI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashToken, randomToken } from '../apps/api/src/auth/crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDirectory = path.join(root, 'apps', 'api');
const wranglerScript = path.join(apiDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

type Mode = 'local' | 'remote';
type ApplicationRow = { id: string; name: string; slug: string; status: string };

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function modeFromArgs(): Mode {
  const local = process.argv.includes('--local');
  const remote = process.argv.includes('--remote');
  if (local === remote) throw new Error('Elegí exactamente un destino: --local o --remote.');
  return remote ? 'remote' : 'local';
}

function loadProductionEnvironment() {
  const file = path.join(root, '.env.canonical-production.local');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

function assertMode(mode: Mode) {
  const values = [process.env.ENVIRONMENT, process.env.CLOUDFLARE_ENV, process.env.NODE_ENV, process.env.WRANGLER_ENV]
    .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());
  if (mode === 'local') {
    if (values.includes('production')) throw new Error('Bloqueado: --local no puede ejecutarse con un entorno production.');
    return;
  }
  loadProductionEnvironment();
  if (!process.argv.includes('--execute') || !process.argv.includes('--confirm-remote')) throw new Error('Bloqueado: un credential remoto requiere --execute --confirm-remote.');
  if (
    process.env.ENVIRONMENT !== 'production'
    || process.env.RESET_PRODUCTION_DATABASE !== 'corsteno-db'
    || process.env.ALLOW_APPLICATION_CREDENTIAL_REMOTE !== 'true'
  ) {
    throw new Error('Bloqueado: un credential remoto requiere ENVIRONMENT=production, RESET_PRODUCTION_DATABASE=corsteno-db y ALLOW_APPLICATION_CREDENTIAL_REMOTE=true.');
  }
}

function runWrangler(mode: Mode, args: string[], capture = false) {
  const environmentArgs = mode === 'local' ? ['--env', 'development'] : [];
  return execFileSync(process.execPath, [wranglerScript, ...environmentArgs, ...args], {
    cwd: apiDirectory,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'ignore', 'inherit'],
  });
}

function queryRows<T>(mode: Mode, sql: string): T[] {
  const raw = runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--command', sql, '--json'], true) as string;
  const payload = JSON.parse(raw) as Array<{ results?: T[] }>;
  return payload[0]?.results ?? [];
}

function executeSql(mode: Mode, sql: string) {
  runWrangler(mode, ['d1', 'execute', 'corsteno-db', mode === 'local' ? '--local' : '--remote', '--command', sql]);
}

async function main() {
  const index = process.argv.indexOf('--application');
  const application = index >= 0 ? process.argv[index + 1] : undefined;
  const execute = process.argv.includes('--execute');
  if (!application || application.startsWith('--')) throw new Error('Uso: pnpm credentials:create --local|--remote --application <slug|id> [--execute] [--confirm-remote]');
  const mode = modeFromArgs();
  assertMode(mode);
  if (!execute) {
    console.log(`Preview: se creará una application credential para ${application} en D1 ${mode}. Agregá --execute para escribir.`);
    return;
  }

  const applications = queryRows<ApplicationRow>(mode, `SELECT id,name,slug,status FROM applications WHERE (id=${quote(application)} OR slug=${quote(application)}) AND status='active'`);
  if (applications.length !== 1) throw new Error(applications.length === 0 ? `No se encontró una application activa para: ${application}` : `La referencia coincide con más de una application: ${application}`);
  const selected = applications[0]!;
  const secret = randomToken();
  const secretHash = await hashToken(secret);
  const now = Date.now();
  // This operation is intentionally insert-only: it creates one new credential
  // for the selected application and never deletes, revokes, or regenerates
  // credentials belonging to this or any other application.
  const sql = `INSERT INTO application_credentials (id,application_id,key_prefix,secret_hash,status,created_at) VALUES (${quote(crypto.randomUUID())},${quote(selected.id)},'cor_app_demo_',${quote(secretHash)},'active',${now});`;
  executeSql(mode, sql);
  console.log(`Application: ${selected.name} (${selected.slug})`);
  console.log(`Credential creada en D1 ${mode}.`);
  console.log(`Secret — copiar ahora; no volverá a mostrarse: ${secret}`);
  console.log('Usar como Authorization: Bearer <secret> y cargarlo como CORSTENO_ANALYTICS_APPLICATION_SECRET en el Worker público.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
