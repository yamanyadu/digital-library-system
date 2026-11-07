import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dev server forwards /api/* to the Express server, so no CORS setup is needed while developing.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const { PORT = '5000' } = loadEnv(mode, projectRoot, '');

  return {
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': `http://localhost:${PORT}` } },
  };
});
