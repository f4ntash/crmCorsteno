import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiUrl = mode === 'production'
    ? process.env.VITE_API_URL || 'https://api.corsteno.com'
    : env.VITE_API_URL || 'http://localhost:8787';
  return {
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
    server: { strictPort: mode === 'https' },
  };
});
