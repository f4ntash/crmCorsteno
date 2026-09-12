import { promises as fs } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { generateSite, normalizePackageName, parseCliArgs, validateOptions } from '../src/generator';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const valid = { name: 'Sitio Demo', slug: 'sitio-demo', siteKey: 'site_demo1234', apiUrl: 'http://localhost:8787', out: '' };
const execFile = promisify(execFileCallback);

describe('site generator inputs', () => {
  it('parses supported non-interactive arguments and normalizes package names', () => {
    expect(parseCliArgs(['--name', 'Demo', '--slug', 'demo', '--site-key', 'site_demo1234', '--api-url', 'https://api.example', '--out', './demo'])).toEqual({ name: 'Demo', slug: 'demo', siteKey: 'site_demo1234', apiUrl: 'https://api.example', out: './demo' });
    expect(normalizePackageName('mi-sitio')).toBe('corsteno-site-mi-sitio');
  });

  it('rejects unsafe or incomplete project inputs', () => {
    expect(() => validateOptions({ ...valid, slug: '../escape' })).toThrow();
    expect(() => validateOptions({ ...valid, siteKey: 'secret' })).toThrow();
    expect(() => validateOptions({ ...valid, apiUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => validateOptions({ ...valid, out: '' })).toThrow();
  });

  it('protects an existing non-empty destination', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'corsteno-generator-test-'));
    const destination = path.join(root, 'existing');
    await fs.mkdir(destination);
    const marker = path.join(destination, 'keep.txt');
    await fs.writeFile(marker, 'keep');
    await expect(generateSite({ ...valid, out: destination }, { repoRoot })).rejects.toThrow('no está vacía');
    await expect(fs.readFile(marker, 'utf8')).resolves.toBe('keep');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('generates a standalone template with explicit configuration and a vendored SDK tarball', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'corsteno-generator-test-'));
    const destination = path.join(root, 'site');
    await generateSite({ ...valid, out: destination }, { repoRoot });
    const packageJson = JSON.parse(await fs.readFile(path.join(destination, 'package.json'), 'utf8')) as { name: string; dependencies: Record<string, string> };
    expect(packageJson.name).toBe('corsteno-site-sitio-demo');
    expect(packageJson.dependencies['@corsteno/client']).toBe('file:./vendor/corsteno-client.tgz');
    expect(await fs.readFile(path.join(destination, '.env'), 'utf8')).toContain('VITE_CORSTENO_SITE_KEY=site_demo1234');
    const archive = path.join(destination, 'vendor', 'corsteno-client.tgz');
    await expect(fs.stat(archive)).resolves.toBeDefined();
    const generatedFiles = ['package.json', '.env.example', 'index.html', 'src/config/brand.ts', 'src/styles.css'];
    for (const relativePath of generatedFiles) {
      await expect(fs.readFile(path.join(destination, relativePath), 'utf8')).resolves.not.toMatch(/__[A-Z_]+__/);
    }
    const archiveListing = await execFile('tar', ['-tzf', archive]);
    expect(archiveListing.stdout).toContain('package/node_modules/@corsteno/types/package.json');
    const manifest = await execFile('tar', ['-xOf', archive, 'package/package.json']);
    expect(manifest.stdout).not.toContain('workspace:');
    await fs.rm(root, { recursive: true, force: true });
  }, 30000);
});
