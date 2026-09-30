import { defineConfig } from 'vite';
import { devSave } from './dev-save';

export default defineConfig({
  // Chemins relatifs : Poki sert le build depuis un sous-dossier de son CDN.
  base: './',
  // Dev uniquement : bouton « Save » des vues de dev (réécrit les valeurs par défaut dans le code source).
  plugins: [devSave()],
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
