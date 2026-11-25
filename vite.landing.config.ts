import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(rootDir, 'landing'),
  publicDir: 'public',
  base: './',
  plugins: [react()],
  css: {
    postcss: rootDir,
  },
  build: {
    outDir: path.resolve(rootDir, 'dist-landing'),
    emptyOutDir: true,
  },
});
