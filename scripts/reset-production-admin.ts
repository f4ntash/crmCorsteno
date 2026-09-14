// Production admin password recovery. Never logs or persists the password.
import { execSync } from 'node:child_process';
import { unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashPassword } from '../apps/api/src/auth/crypto';

type CommandRunner = (command: string, options: { stdio: 'inherit'; shell: true }) => unknown;

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function readHiddenPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('La contraseña interactiva requiere una terminal segura.');
  const stdin = process.stdin;
  let value = '';
  process.stdout.write('Nueva contraseña (mínimo 12 caracteres): ');
  return await new Promise<string>((resolve, reject) => {
    const cleanup = () => { stdin.setRawMode?.(false); stdin.pause(); stdin.removeListener('data', onData); };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { cleanup(); process.stdout.write('\n'); reject(new Error('Operación cancelada.')); return; }
        if (char === '\r' || char === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue; }
        if (char >= ' ') value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

export function buildResetSql(email: string, passwordHash: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  return [
    'BEGIN;',
    `UPDATE users SET password_hash=${quote(passwordHash)},status='active',updated_at=${now} WHERE email_normalized=${quote(normalizedEmail)} AND (platform_role IN ('super_admin','corsteno_admin') OR id IN (SELECT user_id FROM memberships WHERE status='active' AND role IN ('owner','admin')));`,
    `DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email_normalized=${quote(normalizedEmail)} AND (platform_role IN ('super_admin','corsteno_admin') OR id IN (SELECT user_id FROM memberships WHERE status='active' AND role IN ('owner','admin'))));`,
    'COMMIT;',
  ].join('\n');
}

export async function executeResetSql(sql: string, runner: CommandRunner = execSync) {
  const tempFile = path.join(os.tmpdir(), `corsteno-reset-admin-${process.pid}-${Date.now()}.sql`);
  await writeFile(tempFile, sql, { encoding: 'utf8', flag: 'wx' });
  try {
    runner(`pnpm --filter @corsteno/api exec wrangler d1 execute corsteno-db --remote --file ${JSON.stringify(tempFile)}`, { stdio: 'inherit', shell: true });
  } finally {
    await unlink(tempFile).catch(() => undefined);
  }
}

export async function main() {
  const email = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
  const execute = process.argv.includes('--execute');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Falta RESET_ADMIN_EMAIL válido.');
  if (execute && process.env.ENVIRONMENT !== 'production') throw new Error('La ejecución productiva requiere ENVIRONMENT=production.');
  if (!execute) {
    console.log('Preview de reset de administrador (no se ejecutó).');
    console.log(`Usuario objetivo: ${email}`);
    console.log('Al ejecutar, solo se actualizará la contraseña del administrador existente y se invalidarán sus sesiones.');
    return;
  }
  const password = process.env.RESET_ADMIN_PASSWORD ?? await readHiddenPassword();
  if (password.length < 12 || password.length > 200) throw new Error('La contraseña debe tener entre 12 y 200 caracteres.');
  const passwordHash = await hashPassword(password);
  delete process.env.RESET_ADMIN_PASSWORD;
  const sql = buildResetSql(email, passwordHash);
  await executeResetSql(sql);
  console.log(`Reset aplicado al administrador existente ${email}. Sesiones anteriores invalidadas.`);
}

if (process.argv[1]?.endsWith('reset-production-admin.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });
