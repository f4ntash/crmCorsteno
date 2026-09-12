import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);

export type SiteOptions = {
  name: string;
  slug: string;
  siteKey: string;
  apiUrl: string;
  out: string;
};

type PartialSiteOptions = Partial<SiteOptions>;
type TokenKey = keyof SiteOptions | 'packageName' | 'fontFamily';

export const SITE_KEY_PATTERN = /^site_[A-Za-z0-9_-]{8,80}$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TOKEN_FILES: Array<{ relativePath: string; token: string; key: TokenKey }> = [
  { relativePath: 'package.json', token: '__PACKAGE_NAME__', key: 'packageName' },
  { relativePath: '.env.example', token: '__API_URL__', key: 'apiUrl' },
  { relativePath: '.env.example', token: '__SITE_KEY__', key: 'siteKey' },
  { relativePath: 'index.html', token: '__SITE_NAME__', key: 'name' },
  { relativePath: 'src/config/brand.ts', token: '__SITE_NAME__', key: 'name' },
  { relativePath: 'src/styles.css', token: '__FONT_FAMILY__', key: 'fontFamily' },
];

function valueOrEmpty(value: string | undefined) {
  return value?.trim() ?? '';
}

export function normalizePackageName(slug: string) {
  return `corsteno-site-${slug}`;
}

export function parseCliArgs(args: readonly string[]): PartialSiteOptions & { help?: boolean } {
  const result: PartialSiteOptions & { help?: boolean } = {};
  const keys: Record<string, keyof SiteOptions> = {
    '--name': 'name',
    '--slug': 'slug',
    '--site-key': 'siteKey',
    '--api-url': 'apiUrl',
    '--out': 'out',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    const key = keys[arg ?? ''];
    if (!key) throw new Error(`Argumento desconocido: ${arg ?? ''}`);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Falta un valor para ${arg}.`);
    result[key] = next;
    index += 1;
  }
  return result;
}

export function validateOptions(input: PartialSiteOptions): SiteOptions {
  const name = valueOrEmpty(input.name);
  const slug = valueOrEmpty(input.slug);
  const siteKey = valueOrEmpty(input.siteKey);
  const apiUrl = valueOrEmpty(input.apiUrl);
  const out = valueOrEmpty(input.out);
  const issues: string[] = [];
  if (!name || name.length > 120) issues.push('El nombre debe tener entre 1 y 120 caracteres.');
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) issues.push('El slug debe usar minúsculas, números y guiones, sin rutas ni caracteres especiales.');
  if (!SITE_KEY_PATTERN.test(siteKey)) issues.push('El Site Key debe tener el formato site_... esperado.');
  try {
    const parsed = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
  } catch {
    issues.push('La API URL debe ser una URL absoluta http:// o https:// sin credenciales.');
  }
  if (!out) issues.push('La carpeta destino es obligatoria.');
  if (issues.length) throw new Error(issues.join('\n'));
  return { name, slug, siteKey, apiUrl: apiUrl.replace(/\/$/, ''), out };
}

export function resolveOutputPath(out: string, cwd = process.cwd()) {
  return path.resolve(cwd, out);
}

async function ensureSafeDestination(destination: string) {
  try {
    const stats = await fs.lstat(destination);
    if (stats.isSymbolicLink()) throw new Error('La carpeta destino no puede ser un enlace simbólico.');
    if (!stats.isDirectory()) throw new Error('La carpeta destino ya existe y no es una carpeta.');
    const entries = await fs.readdir(destination);
    if (entries.length) throw new Error('La carpeta destino no está vacía. Elegí otra carpeta para no sobrescribir archivos.');
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
}

async function run(command: string, args: string[], cwd: string) {
  await execFile(command, args, { cwd, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 4 * 1024 * 1024 });
}

function commandName(command: string) {
  return process.platform === 'win32' && ['pnpm', 'npm'].includes(command) ? `${command}.cmd` : command;
}

async function findTarball(directory: string, prefix: string) {
  const files = await fs.readdir(directory);
  const file = files.find((entry) => entry.startsWith(prefix) && entry.endsWith('.tgz'));
  if (!file) throw new Error(`No se pudo empaquetar ${prefix}.`);
  return path.join(directory, file);
}

/**
 * Packs the current SDK, then embeds the public type package as a bundled
 * dependency. The generated site still installs one normal file dependency,
 * while the workspace-private SDK remains independent of the monorepo.
 */
export async function packClientForSite(repoRoot: string, destination: string) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'corsteno-site-sdk-'));
  const rawPackages = path.join(temporary, 'raw');
  const clientUnpacked = path.join(temporary, 'client-unpacked');
  const typesUnpacked = path.join(temporary, 'types-unpacked');
  const final = path.join(temporary, 'final');
  await Promise.all([fs.mkdir(rawPackages, { recursive: true }), fs.mkdir(clientUnpacked, { recursive: true }), fs.mkdir(typesUnpacked, { recursive: true }), fs.mkdir(final, { recursive: true })]);
  try {
    await run(commandName('pnpm'), ['-C', 'packages/types', 'pack', '--pack-destination', rawPackages], repoRoot);
    await run(commandName('pnpm'), ['-C', 'packages/client', 'pack', '--pack-destination', rawPackages], repoRoot);
    const typesTarball = await findTarball(rawPackages, 'corsteno-types-');
    const clientTarball = await findTarball(rawPackages, 'corsteno-client-');
    await run(commandName('tar'), ['-xzf', clientTarball, '-C', clientUnpacked], repoRoot);
    await run(commandName('tar'), ['-xzf', typesTarball, '-C', typesUnpacked], repoRoot);
    const clientPackage = path.join(clientUnpacked, 'package');
    const clientManifestPath = path.join(clientPackage, 'package.json');
    const clientManifest = JSON.parse(await fs.readFile(clientManifestPath, 'utf8')) as { dependencies?: Record<string, string>; bundledDependencies?: string[] };
    clientManifest.dependencies = { ...(clientManifest.dependencies ?? {}), '@corsteno/types': '0.1.0' };
    clientManifest.bundledDependencies = [...new Set([...(clientManifest.bundledDependencies ?? []), '@corsteno/types'])];
    await fs.writeFile(clientManifestPath, `${JSON.stringify(clientManifest, null, 2)}\n`, 'utf8');
    await fs.mkdir(path.join(clientPackage, 'node_modules', '@corsteno'), { recursive: true });
    await fs.cp(path.join(typesUnpacked, 'package'), path.join(clientPackage, 'node_modules', '@corsteno', 'types'), { recursive: true });
    await run(commandName('npm'), ['pack', '--ignore-scripts', '--pack-destination', final], clientPackage);
    const packed = await findTarball(final, 'corsteno-client-');
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(packed, path.join(destination, 'corsteno-client.tgz'));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function replaceToken(filePath: string, token: string, value: string) {
  const source = await fs.readFile(filePath, 'utf8');
  if (!source.includes(token)) throw new Error(`Falta el placeholder ${token} en ${filePath}.`);
  await fs.writeFile(filePath, source.replaceAll(token, value), 'utf8');
}

export async function generateSite(options: SiteOptions, dependencies: { repoRoot?: string; templateDirectory?: string } = {}) {
  const repoRoot = dependencies.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const templateDirectory = dependencies.templateDirectory ?? path.join(repoRoot, 'templates', 'site-starter');
  const destination = resolveOutputPath(options.out);
  await ensureSafeDestination(destination);
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'corsteno-site-output-'));
  try {
    const vendor = path.join(staging, 'vendor');
    await packClientForSite(repoRoot, vendor);
    await fs.cp(templateDirectory, staging, { recursive: true });
    const packageName = normalizePackageName(options.slug);
    for (const token of TOKEN_FILES) {
      const value = token.key === 'packageName'
        ? packageName
        : token.key === 'fontFamily'
          ? "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          : options[token.key];
      await replaceToken(path.join(staging, token.relativePath), token.token, value);
    }
    const env = `VITE_CORSTENO_API_URL=${options.apiUrl}\nVITE_CORSTENO_SITE_KEY=${options.siteKey}\n`;
    await fs.writeFile(path.join(staging, '.env'), env, 'utf8');
    await fs.mkdir(destination, { recursive: true });
    await fs.cp(staging, destination, { recursive: true });
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  return { destination, packageName: normalizePackageName(options.slug) };
}
