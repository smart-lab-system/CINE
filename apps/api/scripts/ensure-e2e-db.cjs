/**
 * Ensures Postgres has `examcollect_e2e` (+ schema) and prints the URL
 * `test:e2e` / `migration:run:e2e` expect. Safe to re-run.
 *
 * Connects to the *maintenance* database from DATABASE_URL (or the
 * examcollect default), never to the e2e DB itself for CREATE DATABASE.
 */
const { Client } = require('pg');
const { config } = require('dotenv');
const { resolve } = require('path');

config({ path: resolve(__dirname, '../.env') });

const MAIN = 'examcollect';
const E2E = 'examcollect_e2e';

function databaseNameFromUrl(url) {
  return new URL(url).pathname.replace(/^\//, '').split('?')[0] ?? '';
}

function withDatabase(url, dbName) {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

async function main() {
  const base =
    process.env.DATABASE_URL ??
    'postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect';

  const adminUrl = withDatabase(base, databaseNameFromUrl(base) || MAIN);
  const e2eUrl = withDatabase(base, E2E);

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rows } = await admin.query(
      `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
      [E2E],
    );
    if (rows.length === 0) {
      // CREATE DATABASE cannot run inside a transaction block.
      await admin.query(`CREATE DATABASE ${E2E}`);
      console.log(`Created database ${E2E}`);
    } else {
      console.log(`Database ${E2E} already exists`);
    }
  } finally {
    await admin.end();
  }

  const e2e = new Client({ connectionString: e2eUrl });
  await e2e.connect();
  try {
    await e2e.query(`CREATE SCHEMA IF NOT EXISTS examcollect`);
    console.log(`Schema examcollect ready on ${E2E}`);
  } finally {
    await e2e.end();
  }

  console.log(`E2E DATABASE_URL=${e2eUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
