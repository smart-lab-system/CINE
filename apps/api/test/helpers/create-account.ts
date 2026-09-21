import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';

export type TestAccountRole = 'admin' | 'teacher';

/**
 * Inserts an account directly, bypassing the API — there's no self-serve
 * /auth/register any more (see auth.controller.ts), so this is the e2e
 * equivalent of the manual bootstrap README documents for the first real
 * admin account.
 */
export async function createTestAccount(
  dataSource: DataSource,
  options: { name?: string; email: string; password: string; role: TestAccountRole },
): Promise<string> {
  const passwordHash = await argon2.hash(options.password, { type: argon2.argon2id });
  const [{ id }] = await dataSource.query(
    `INSERT INTO examcollect.account (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [options.name ?? 'Test Account', options.email, passwordHash, options.role],
  );
  return id as string;
}
