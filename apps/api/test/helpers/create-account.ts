import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import type { AccountRole } from '../../src/identity/entities/account.entity';

/**
 * Alias, không phải bản chép.
 *
 * Trước đây đây là một union viết tay trùng nội dung với `AccountRole` — và
 * một danh sách chép tay là chỗ một giá trị đã nghỉ (`super_admin`) có thể
 * sống sót sau khi enum đã đổi, rồi từ đó bò ngược vào code thật.
 */
export type TestAccountRole = AccountRole;

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
