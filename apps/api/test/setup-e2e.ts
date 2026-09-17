/**
 * Runs before any e2e file loads AppModule / data-source.
 * dotenv does not override existing env vars, so we rewrite DATABASE_URL
 * here first — then assert it is a *_e2e database.
 *
 * SEED_API_ENABLED is cleared so AppModule never registers SeedModule during
 * e2e (avoids .env / worker pollution). Suites that need seed routes import
 * SeedModule explicitly in Test.createTestingModule.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  assertE2eDatabase,
  toE2eDatabaseUrl,
} from './e2e-database';

config({ path: resolve(__dirname, '../.env') });

const fallback =
  'postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect';

process.env.DATABASE_URL = toE2eDatabaseUrl(
  process.env.DATABASE_URL ?? fallback,
);

assertE2eDatabase(process.env.DATABASE_URL);

// Prefer 'false' over delete: later `import 'dotenv/config'` (data-source)
// would re-apply SEED_API_ENABLED from .env if the key were merely unset.
process.env.SEED_API_ENABLED = 'false';
