import { ensureE2eDatabaseReady } from '../src/database/e2e-database';

export default async function globalSetup(): Promise<void> {
  await ensureE2eDatabaseReady();
}
