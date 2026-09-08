import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { AccountEntity } from '../identity/entities/account.entity';

/**
 * AccountsService is a plain single-table CRUD service now — role lives
 * inline on `account`, so there's no more multi-statement write to verify
 * transactionally (that used to be the whole point of this file, back when
 * a create/update touched both `users` and `user_roles`). What's still
 * worth a fast unit test, rather than leaving it to accounts.e2e-spec.ts
 * against the real DB: that the plaintext password never reaches
 * save() unhashed, and that update() doesn't clobber fields the caller
 * didn't send.
 *
 * `overrides` is typed against the mock shape below, not
 * `Partial<Repository<AccountEntity>>` — spreading the latter into the
 * object literal would union each overridden key with Repository's real
 * (non-jest.Mock) method signature, and the union loses `.mock`.
 */
/** Hình dạng một dòng của câu đếm phụ thuộc trong `remove()`. count(*) của
 *  Postgres về qua driver dưới dạng CHUỖI, nên mock phải là chuỗi. */
const ZERO_DEPENDENCIES = {
  courses: '0',
  classes: '0',
  exam_sessions: '0',
  rubrics: '0',
  audit_entries: '0',
};

function createHarness(overrides: Record<string, jest.Mock> = {}) {
  const existing: AccountEntity = {
    id: 'account-1',
    name: 'Existing Name',
    email: 'existing@example.com',
    passwordHash: 'argon2id$fake-existing-hash',
    role: 'teacher',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const repo = {
    create: jest.fn((entity) => entity),
    save: jest.fn(async (entity) => ({ id: 'account-1', ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue(existing),
    // `remove()` đếm phụ thuộc trước khi xoá. Mặc định "không phụ thuộc gì",
    // để test xoá-được vẫn nói về việc xoá; hai test dưới override nó.
    query: jest.fn().mockResolvedValue([ZERO_DEPENDENCIES]),
    ...overrides,
  };

  const service = new AccountsService(repo as unknown as Repository<AccountEntity>);
  return { service, repo, existing };
}

const createDto = {
  name: 'New Teacher',
  email: 'new-teacher@example.com',
  password: 'correct-horse-battery',
  role: 'teacher' as const,
};

describe('AccountsService', () => {
  it('create() saves an argon2 hash, never the plaintext password', async () => {
    const { service, repo } = createHarness();

    await service.create(createDto);

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0];
    expect(saved.passwordHash).toBeDefined();
    expect(saved.passwordHash).not.toBe(createDto.password);
    expect(saved.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(saved).not.toHaveProperty('password');
  });

  it('update() only overwrites the fields present in the DTO', async () => {
    const { service, repo, existing } = createHarness();

    await service.update('account-1', { name: 'Renamed' });

    expect(repo.update).toHaveBeenCalledWith('account-1', {
      name: 'Renamed',
      email: existing.email,
      role: existing.role,
    });
  });

  it('update() throws NotFoundException for a missing account', async () => {
    const { service } = createHarness({
      findOne: jest.fn().mockResolvedValue(null),
    });

    await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('remove() hard-deletes the row once it is confirmed to exist', async () => {
    const { service, repo } = createHarness();

    await service.remove('account-1');

    expect(repo.delete).toHaveBeenCalledWith('account-1');
  });

  it('remove() throws NotFoundException instead of deleting a missing account', async () => {
    const { service, repo } = createHarness({
      findOne: jest.fn().mockResolvedValue(null),
    });

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('remove() gọi phụ thuộc học vụ là GIẢI ĐƯỢC, và không xoá', async () => {
    const { service, repo } = createHarness({
      query: jest
        .fn()
        .mockResolvedValue([{ ...ZERO_DEPENDENCIES, courses: '3', classes: '1' }]),
    });

    await expect(service.remove('account-1')).rejects.toMatchObject({
      response: {
        resolvable: { courses: 3, classes: 1, examSessions: 0, rubrics: 0 },
        permanent: { auditLogEntries: 0 },
      },
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('remove() gọi dòng audit là VĨNH VIỄN, và nói ra thay vì bảo thử lại', async () => {
    // Phân biệt hai loại là toàn bộ giá trị của việc đếm. `audit_log` mang
    // trigger BEFORE UPDATE OR DELETE, nên dòng chặn không xoá được để giải
    // chặn — một con số tổng sẽ hàm ý "gỡ hết rồi thử lại", lời khuyên không
    // bao giờ chạy được.
    const { service, repo } = createHarness({
      query: jest
        .fn()
        .mockResolvedValue([{ ...ZERO_DEPENDENCIES, audit_entries: '7' }]),
    });

    await expect(service.remove('account-1')).rejects.toMatchObject({
      response: { permanent: { auditLogEntries: 7 } },
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
