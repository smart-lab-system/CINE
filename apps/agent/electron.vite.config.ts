import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Custom paths throughout (`electron/main`, `electron/preload`,
 * `electron/renderer`) rather than electron-vite's zero-config default
 * (`src/main`, `src/preload`, `src/renderer`) — this package's `src/`
 * already holds the pure Node modules `cli.ts` and this Electron app both
 * depend on (design spec §7's package structure), so it stays put.
 */
export default defineConfig({
  main: {
    // Keeps node_modules out of the main bundle — this process runs under
    // real Node (via Electron), so requiring them at runtime is fine and
    // bundling them would just duplicate what's already on disk.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts'),
      },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts'),
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: 'electron/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/renderer/index.html'),
      },
      outDir: 'out/renderer',
    },
  },
});
