import { defineConfig } from 'vite';

export default defineConfig(() => ({
  esbuild: {
    target: 'node14',
  },
}));
