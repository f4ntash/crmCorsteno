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
  const password = process.env.RESET_ADMIN_PASSWORD;
  const execute = process.argv.includes('--execute');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Falta RESET_ADMIN_EMAIL válido.');
  if (!password || password.length < 12 || password.length > 200) throw new Error('RESET_ADMIN_PASSWORD debe tener entre 12 y 200 caracteres.');
  if (execute && process.env.ENVIRONMENT !== 'production') throw new Error('La ejecución productiva requiere ENVIRONMENT=production.');
  const passwordHash = await hashPassword(password);
  const sql = buildResetSql(email, passwordHash);
  if (!execute) {
    console.log('Preview de reset de administrador (no se ejecutó).');
    console.log(`Usuario objetivo: ${email}`);
    console.log('Al ejecutar, solo se actualizará la contraseña del administrador existente y se invalidarán sus sesiones.');
    return;
  }
  await executeResetSql(sql);
  console.log(`Reset aplicado al administrador existente ${email}. Sesiones anteriores invalidadas.`);
}

if (process.argv[1]?.endsWith('reset-production-admin.ts')) main().catch((error) => { console.error(error); process.exitCode = 1; });
