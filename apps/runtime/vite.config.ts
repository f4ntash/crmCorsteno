import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function mirrorRuntimeBuildToRoot(): Plugin {
  let subdirectoryOutput = '';

  return {
    name: 'mirror-runtime-build-to-root',
    configResolved(config) {
      subdirectoryOutput = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const rootOutput = dirname(subdirectoryOutput);
      await mkdir(rootOutput, { recursive: true });
      for (const entry of await readdir(subdirectoryOutput, { withFileTypes: true })) {
        await cp(
          resolve(subdirectoryOutput, entry.name),
          resolve(rootOutput, entry.name),
          { recursive: true, force: true },
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = mode === 'production'
    ? process.env.VITE_API_URL || env.VITE_API_URL || 'https://api.corsteno.com'
    : process.env.VITE_API_URL || env.VITE_API_URL || 'http://localhost:8787';
  return {
    base: '/r/',
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [react(), mirrorRuntimeBuildToRoot()],
    build: { outDir: 'dist/r' },
    server: { port: 5175, strictPort: true },
  };
});
