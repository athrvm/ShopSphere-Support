import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  return {
    plugins: [react()],
    envDir: '..',
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${env.PORT || 8080}` }
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.js'],
      restoreMocks: true,
      testTimeout: 15000,
      maxWorkers: 1
    }
  };
});
