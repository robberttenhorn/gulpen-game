import { defineConfig } from 'vite';

// Elke build krijgt een eigen versienummer. De game gebruikt dat om:
// - de kaartbestanden in public/data altijd vers op te halen (?v=...), zodat nieuwe code nooit oude data krijgt;
// - te zien of er een nieuwere versie online staat (version.json) en dan een melding te tonen.
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const versionFile = () => ({
  name: 'versie',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

// base './' zodat de game ook vanuit een submap werkt (bijv. GitHub Pages).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [versionFile()],
  build: { chunkSizeWarningLimit: 1500 },
});
