/**
 * Runs TypeORM migrations against the e2e database only.
 * Refuses main `examcollect` the same way jest e2e setup does.
 */
const { spawnSync } = require('child_process');
const { resolve } = require('path');
const { config } = require('dotenv');

config({ path: resolve(__dirname, '../.env') });

const MAIN = 'examcollect';
const E2E = 'examcollect_e2e';

function databaseNameFromUrl(url) {
  return new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
}

function toE2eUrl(url) {
  const parsed = new URL(url);
  const db = databaseNameFromUrl(url);
  if (/_e2e$/i.test(db)) return url;
  if (db === MAIN) {
    parsed.pathname = `/${E2E}`;
    return parsed.toString();
  }
  throw new Error(
    `Refusing migration:run:e2e against database "${db}". Use ${E2E}.`,
  );
}

const base =
  process.env.DATABASE_URL ??
  'postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect';

process.env.DATABASE_URL = toE2eUrl(base);

const result = spawnSync(
  process.execPath,
  [
    '-r',
    'ts-node/register',
    '-r',
    'dotenv/config',
    '-r',
    'tsconfig-paths/register',
    resolve(__dirname, '../node_modules/typeorm/cli.js'),
    'migration:run',
    '-d',
    resolve(__dirname, '../src/database/data-source.ts'),
  ],
  {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
