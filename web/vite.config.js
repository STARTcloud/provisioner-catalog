import fs from 'fs';
import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import YAML from 'yaml';

// Version/name come from THIS package's own package.json, so the UI builds
// standalone.
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// Dev-server settings come from this package's own config.yaml (not a dotfile,
// not hardcoded). They only affect the local dev server; the built SPA is
// static and talks to same-origin URLs at runtime.
const loadDevConfig = () => {
  const configPath = './config.yaml';
  if (fs.existsSync(configPath)) {
    return YAML.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return {};
};

const devConfig = loadDevConfig();
const devPort = devConfig.server?.port || 8080;
const apiTarget = devConfig.server?.api_target || 'https://provisioner-catalog.startcloud.com';

const localeDirs = fs.existsSync('./public/locales')
  ? fs
      .readdirSync('./public/locales', { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  : [];
const supportedLocales = localeDirs.length ? localeDirs : ['en'];

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.name),
    __SUPPORTED_LOCALES__: JSON.stringify(supportedLocales),
  },
  plugins: [react()],
  base: '/',
  publicDir: 'public',
  server: {
    port: devPort,
    strictPort: true, // the registered OIDC callback is exact-match on :8080
    host: 'localhost',
    hmr: {
      port: devPort,
      host: 'localhost',
    },
    proxy: {
      '/catalog.json': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/private': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        callback: fileURLToPath(new URL('./callback/index.html', import.meta.url)),
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
        manualChunks: id => {
          // React-Bootstrap UI framework + its runtime deps, split out of
          // vendor to keep chunks small.
          if (
            id.includes('node_modules/react-bootstrap') ||
            id.includes('node_modules/@restart') ||
            id.includes('node_modules/@popperjs') ||
            id.includes('node_modules/dom-helpers')
          ) {
            return 'react-bootstrap';
          }

          // Everything else stays together in vendor to avoid dependency
          // issues (React, Axios, utilities, etc.).
          if (id.includes('node_modules')) {
            return 'vendor';
          }

          return undefined;
        },
      },
    },
  },
});
