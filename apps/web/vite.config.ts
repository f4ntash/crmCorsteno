import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = mode === 'production'
    ? process.env.VITE_API_URL || 'https://api.corsteno.com'
    : env.VITE_API_URL || 'http://localhost:8787';
  const runtimeBaseUrl = mode === 'production'
    ? process.env.VITE_RUNTIME_BASE_URL || env.VITE_RUNTIME_BASE_URL
    : env.VITE_RUNTIME_BASE_URL || 'http://localhost:5175';
  if (mode === 'production' && !runtimeBaseUrl) {
    throw new Error('VITE_RUNTIME_BASE_URL is required for a production build.');
  }
  return {
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_RUNTIME_BASE_URL': JSON.stringify(runtimeBaseUrl),
    },
    plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
    optimizeDeps: { exclude: ['@tracear/sdk'] },
    // Never silently move the CRM to another port: the test browser and API
    // CORS configuration must target the same local origin intentionally.
    server: { strictPort: true },
  };
});
