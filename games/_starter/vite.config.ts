import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : Poki sert le build depuis un sous-dossier de son CDN.
  base: './',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 2000,
  },
});
