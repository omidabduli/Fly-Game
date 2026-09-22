import { defineConfig } from 'vitest/config';

// Relative base path, so the build works on any GitHub Pages URL
// (https://<user>.github.io/<repo>/) or a custom domain.
// Set VITE_BASE to override it (e.g. VITE_BASE=/fly-escape-lab/).
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: {
    target: 'es2020',
    // adds -webkit- prefixes etc. for older iPhones
    cssTarget: ['safari14', 'ios14', 'chrome90', 'firefox90', 'edge90'],
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
