/// <reference types="electron-vite/node" />

/**
 * electron-vite's own `ImportMetaEnv` (node_modules/electron-vite/node.d.ts)
 * only types the built-in MODE/DEV/PROD keys. `MAIN_VITE_BACKEND_URL` is a
 * custom var baked into the main-process bundle at build time from
 * `.env.production` (electron-vite's `MAIN_VITE_` prefix convention) — see
 * BACKEND_URL in `main/index.ts` for how it's read.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_BACKEND_URL?: string;
}
