import { defineConfig } from 'vite';

// base './' zodat de game ook vanuit een submap werkt (bijv. GitHub Pages).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
