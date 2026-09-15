import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.NODE_OPTIONS?.includes('--experimental-sqlite')) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--experimental-sqlite'].filter(Boolean).join(' ');
}

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [vitest, 'run', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exitCode = result.status ?? 1;
