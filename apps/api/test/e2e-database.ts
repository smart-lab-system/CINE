/**
 * E2e tests must never touch the demo/dev database (`examcollect`).
 * Only databases whose name ends with `_e2e` are allowed (canonical:
 * `examcollect_e2e`).
 */
export const MAIN_DATABASE_NAME = 'examcollect';
export const E2E_DATABASE_NAME = 'examcollect_e2e';

const ALLOWED_E2E_DB = /_e2e$/i;

export function databaseNameFromUrl(connectionUrl: string): string {
  const pathname = new URL(connectionUrl).pathname.replace(/^\//, '');
  // URL pathname can be `examcollect` or `examcollect?…` — strip query if any
  // leaked into pathname (node URL keeps query separate, but be defensive).
  return pathname.split('?')[0] ?? '';
}

/** Rewrite a URL pointed at the main DB onto the dedicated e2e database. */
export function toE2eDatabaseUrl(connectionUrl: string): string {
  const parsed = new URL(connectionUrl);
  const dbName = databaseNameFromUrl(connectionUrl);

  if (ALLOWED_E2E_DB.test(dbName)) {
    return connectionUrl;
  }

  if (dbName === MAIN_DATABASE_NAME) {
    parsed.pathname = `/${E2E_DATABASE_NAME}`;
    return parsed.toString();
  }

  throw new Error(
    `Refusing to derive an e2e DATABASE_URL from database "${dbName}". ` +
      `Point apps/api/.env at "${MAIN_DATABASE_NAME}" (auto-rewritten to ` +
      `"${E2E_DATABASE_NAME}") or set DATABASE_URL to a *_e2e database explicitly.`,
  );
}

export function assertE2eDatabase(connectionUrl: string | undefined): void {
  if (!connectionUrl) {
    throw new Error(
      'DATABASE_URL is unset. E2e tests require a dedicated *_e2e Postgres database.',
    );
  }

  const dbName = databaseNameFromUrl(connectionUrl);
  if (!ALLOWED_E2E_DB.test(dbName)) {
    throw new Error(
      `Refusing to run e2e tests against database "${dbName}". ` +
        `Use a dedicated test database such as "${E2E_DATABASE_NAME}" ` +
        `(never "${MAIN_DATABASE_NAME}").`,
    );
  }
}
