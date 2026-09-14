import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const apiUrl = mode === 'production' ? process.env.VITE_API_URL : process.env.VITE_API_URL || 'http://localhost:8787';
  if (mode === 'production' && !apiUrl) throw new Error('VITE_API_URL is required for a production runtime build.');
  return {
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl) },
    plugins: [react()],
    server: { port: 5175, strictPort: true },
  };
});
