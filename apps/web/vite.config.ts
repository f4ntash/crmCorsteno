import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolveRuntimeBaseUrl } from './src/shared/runtime/runtimeBaseUrlConfig';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = mode === 'production'
    ? process.env.VITE_API_URL || 'https://api.corsteno.com'
    : env.VITE_API_URL || 'http://localhost:8787';
  const runtimeBaseUrl = resolveRuntimeBaseUrl({
    production: mode === 'production',
    configuredBaseUrl: mode === 'production' ? undefined : env.VITE_RUNTIME_BASE_URL,
  });
  return {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_RUNTIME_BASE_URL': JSON.stringify(runtimeBaseUrl),
    },
    plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
    optimizeDeps: { exclude: ['@tracear/sdk'] },
    server: { strictPort: mode === 'https' },
  };
});
