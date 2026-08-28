import { config } from 'dotenv';
import { Client } from 'pg';
import { DataSource, DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from './data-source';

config();

export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://lab_admin:lab_admin_password@localhost:5442/lab_management_e2e';

const ALLOWED_E2E_DB = /^lab_management_(e2e|test)$/;

export function resolveE2eDatabaseUrl(): string {
  return (
    process.env.E2E_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL_E2E?.trim() ||
    DEFAULT_E2E_DATABASE_URL
  );
}

export function databaseNameFromUrl(connectionUrl: string): string {
  const pathname = new URL(connectionUrl).pathname.replace(/^\//, '');
  if (!pathname) {
    throw new Error(`Invalid database URL (missing database name): ${connectionUrl}`);
  }
  return pathname;
}

export function assertE2eDatabaseUrl(connectionUrl: string): void {
  const dbName = databaseNameFromUrl(connectionUrl);
  if (!ALLOWED_E2E_DB.test(dbName)) {
    throw new Error(
      `Refusing to run e2e tests against database "${dbName}". ` +
        'Use a dedicated test database such as lab_management_e2e ' +
        '(set E2E_DATABASE_URL in apps/api/.env).',
    );
  }
}

/** Point Nest/TypeORM at the isolated e2e database for this process. */
export function applyE2eDatabaseEnv(): string {
  const e2eUrl = resolveE2eDatabaseUrl();
  assertE2eDatabaseUrl(e2eUrl);
  process.env.DATABASE_URL = e2eUrl;
  process.env.DATABASE_SCHEMA =
    process.env.E2E_DATABASE_SCHEMA?.trim() ||
    process.env.DATABASE_SCHEMA ||
    'lab_management';
  process.env.NODE_ENV = 'test';
  return e2eUrl;
}

function adminDatabaseUrl(connectionUrl: string): string {
  const url = new URL(connectionUrl);
  url.pathname = '/postgres';
  return url.toString();
}

export async function ensureE2eDatabaseReady(): Promise<void> {
  const e2eUrl = applyE2eDatabaseEnv();
  const dbName = databaseNameFromUrl(e2eUrl);
  const schema = process.env.DATABASE_SCHEMA ?? 'lab_management';

  const admin = new Client({ connectionString: adminDatabaseUrl(e2eUrl) });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      if (!ALLOWED_E2E_DB.test(dbName)) {
        throw new Error(`Unsafe database name for e2e bootstrap: ${dbName}`);
      }
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    }
  } finally {
    await admin.end();
  }

  const bootstrap = new Client({ connectionString: e2eUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  } finally {
    await bootstrap.end();
  }

  const dataSource = new DataSource({
    ...dataSourceOptions,
    url: e2eUrl,
    schema,
  } as DataSourceOptions);
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

function quoteIdent(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}
