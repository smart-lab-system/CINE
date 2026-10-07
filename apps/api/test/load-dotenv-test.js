/**
 * Preload for CLI scripts that must use `.env.test` (e.g. migration:run:e2e).
 * Runs before `data-source.ts` imports `dotenv/config`, so the later load
 * cannot overwrite these values (dotenv does not override by default).
 */
const { resolve } = require('node:path');
const { config } = require('dotenv');

config({ path: resolve(__dirname, '..', '.env.test'), override: true });
