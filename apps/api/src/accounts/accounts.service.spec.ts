import { EntityManager, Repository } from 'typeorm';
import { AccountsService } from './accounts.service';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';

/**
 * These are the atomicity cases that can't be provoked through HTTP against
 * the real database: nothing an admin can send makes `create()`'s or
 * `update()`'s *second* write fail on its own (the only naturally failing
 * statement is `remove()`'s user soft-delete, which
 * accounts.e2e-spec.ts exercises for real via the guard_master_soft_delete
 * trigger). So the transaction boundary is verified structurally here — the
 * fake EntityManager below behaves like TypeORM's: it runs the callback, and
 * if the callback rejects it records a rollback and rethrows. A write that
 * lands inside that callback is a write Postgres will undo.
 */
function createHarness(overrides: {
  users?: Partial<Repository<UserEntity>>;
  userRoles?: Partial<Repository<UserRoleEntity>>;
  roles?: Partial<Repository<RoleEntity>>;
} = {}) {
  const state = { rolledBack: false, committed: false, transactions: 0 };

  const userRoles = {
    create: jest.fn((entity) => entity),
    save: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn().mockResolvedValue([]),
    ...overrides.userRoles,
  };
  const roles = {
    find: jest.fn().mockResolvedValue([{ id: 1, code: 'student' }]),
    ...overrides.roles,
  };
  const users = {
    create: jest.fn((entity) => entity),
    save: jest.fn().mockResolvedValue({ id: 'user-1' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue({
      id: 'user-1',
      username: 'someone',
      email: null,
      displayName: 'Someone',
      status: 'active',
      deletedAt: null,
    }),
    ...overrides.users,
  };

  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === UserEntity) return users;
      if (entity === UserRoleEntity) return userRoles;
      if (entity === RoleEntity) return roles;
      throw new Error('unexpected entity requested from the fake manager');
    },
    transaction: async (runInTransaction: (m: EntityManager) => Promise<any>) => {
      state.transactions += 1;
      try {
        const result = await runInTransaction(manager as unknown as EntityManager);
        state.committed = true;
        return result;
      } catch (error) {
        state.rolledBack = true;
        throw error;
      }
    },
  };

  const service = new AccountsService(
    { ...users, manager } as unknown as Repository<UserEntity>,
    userRoles as unknown as Repository<UserRoleEntity>,
    roles as unknown as Repository<RoleEntity>,
  );

  return { service, state, users, userRoles, roles };
}

const createDto = {
  username: 'new_user',
  password: 'correct-horse-battery',
  displayName: 'New User',
  roleCodes: ['student'],
};

describe('AccountsService transaction boundaries', () => {
  it('create() runs the user insert and the role assignments in one transaction', async () => {
    const { service, state, users, userRoles } = createHarness();

    await expect(service.create(createDto)).resolves.toEqual({ id: 'user-1' });

    expect(state.transactions).toBe(1);
    expect(state.committed).toBe(true);
    expect(users.save).toHaveBeenCalledTimes(1);
    expect(userRoles.save).toHaveBeenCalledTimes(1);
  });

  it('create() rolls back the user insert when the role assignments fail', async () => {
    const { service, state, users } = createHarness({
      userRoles: { save: jest.fn().mockRejectedValue(new Error('boom')) },
    });

    await expect(service.create(createDto)).rejects.toThrow('boom');

    // The user row was written, then the failure hit — the point is that both
    // happened inside the transaction, so the insert never survives.
    expect(users.save).toHaveBeenCalledTimes(1);
    expect(state.rolledBack).toBe(true);
    expect(state.committed).toBe(false);
  });

  it('update() rolls back rather than leaving the account with no roles', async () => {
    const { service, state, userRoles } = createHarness({
      userRoles: {
        update: jest.fn().mockResolvedValue({ affected: 2 }),
        save: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });

    await expect(
      service.update('user-1', { roleCodes: ['lecturer'] }),
    ).rejects.toThrow('boom');

    // The old assignments were soft-deleted and the replacements never
    // landed — the exact partial state the transaction exists to undo.
    expect(userRoles.update).toHaveBeenCalledTimes(1);
    expect(state.rolledBack).toBe(true);
  });

  it('remove() runs the role clear and the user soft-delete in one transaction', async () => {
    const { service, state, users, userRoles } = createHarness();

    await service.remove('user-1');

    expect(state.transactions).toBe(1);
    expect(state.committed).toBe(true);
    expect(userRoles.update).toHaveBeenCalledTimes(1);
    expect(users.update).toHaveBeenCalledTimes(1);
  });

  it('remove() rolls back the role clear when the user soft-delete fails', async () => {
    const { service, state, userRoles } = createHarness({
      users: { update: jest.fn().mockRejectedValue(new Error('23503')) },
    });

    await expect(service.remove('user-1')).rejects.toThrow('23503');

    expect(userRoles.update).toHaveBeenCalledTimes(1);
    expect(state.rolledBack).toBe(true);
    expect(state.committed).toBe(false);
  });
});
