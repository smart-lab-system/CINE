import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { LecturerEntity } from '../master-data/entities/lecturer.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

export interface AccountLinkedProfile {
  type: 'lecturer' | 'student';
  code: string;
  fullName: string;
}

export interface AccountView {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: string;
  roles: string[];
  linkedProfile: AccountLinkedProfile | null;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
  ) {}

  async create(dto: CreateAccountDto): Promise<{ id: string }> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    // Hashing stays outside the transaction — argon2 is deliberately slow
    // (tens of milliseconds), and holding a DB transaction open for it would
    // pin a connection for no reason.
    return this.users.manager.transaction(async (manager) => {
      const txUsers = manager.getRepository(UserEntity);
      const txUserRoles = manager.getRepository(UserRoleEntity);
      const txRoles = manager.getRepository(RoleEntity);

      const user = await txUsers.save(
        txUsers.create({
          username: dto.username,
          email: dto.email ?? null,
          passwordHash,
          displayName: dto.displayName,
          status: 'active',
        }),
      );

      const roles = await txRoles.find({ where: { code: In(dto.roleCodes) } });
      await txUserRoles.save(
        roles.map((role) =>
          txUserRoles.create({ userId: user.id, roleId: role.id }),
        ),
      );

      return { id: user.id };
    });
  }

  async search(
    query: SearchAccountsDto,
  ): Promise<{ items: AccountView[]; total: number }> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(u.username ILIKE :term OR u.display_name ILIKE :term OR u.email ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('u.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [users, total] = await qb.getManyAndCount();
    const linkedProfiles = await this.loadLinkedProfiles(users.map((u) => u.id));
    const items = await Promise.all(
      users.map((u) => this.toView(u, linkedProfiles.get(u.id) ?? null)),
    );

    return { items, total };
  }

  async findOne(id: string): Promise<AccountView> {
    const user = await this.findActiveOrThrow(id);
    const linkedProfiles = await this.loadLinkedProfiles([user.id]);
    return this.toView(user, linkedProfiles.get(user.id) ?? null);
  }

  async update(id: string, dto: UpdateAccountDto): Promise<AccountView> {
    const user = await this.findActiveOrThrow(id);

    // Atomic: without a transaction, a failure after the role assignments
    // were cleared but before the replacements landed would strip the
    // account's roles outright.
    await this.users.manager.transaction(async (manager) => {
      const txUsers = manager.getRepository(UserEntity);
      const txUserRoles = manager.getRepository(UserRoleEntity);
      const txRoles = manager.getRepository(RoleEntity);

      await txUsers.update(id, {
        email: dto.email ?? user.email,
        displayName: dto.displayName ?? user.displayName,
        status: dto.status ?? user.status,
      });

      if (dto.roleCodes) {
        // UserRoleEntity models `deleted_at` as a plain @Column, not a
        // @DeleteDateColumn, so Repository#softDelete() would throw
        // MissingDeleteDateColumnError. Setting the column directly via
        // update() has the identical effect for the DB's soft-delete trigger.
        await txUserRoles.update({ userId: id }, { deletedAt: new Date() });
        const roles = await txRoles.find({ where: { code: In(dto.roleCodes) } });
        await txUserRoles.save(
          roles.map((role) => txUserRoles.create({ userId: id, roleId: role.id })),
        );
      }
    });

    const updated = await this.findActiveOrThrow(id);
    const linkedProfiles = await this.loadLinkedProfiles([updated.id]);
    return this.toView(updated, linkedProfiles.get(updated.id) ?? null);
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);

    // Atomic: the second statement can genuinely fail — the DDL's
    // guard_master_soft_delete trigger raises 23503 on `users` if any other
    // active child row (a `students`/`lecturers` profile) still references
    // it. Without a transaction that failure would leave a live account with
    // its role assignments already wiped.
    await this.users.manager.transaction(async (manager) => {
      const txUsers = manager.getRepository(UserEntity);
      const txUserRoles = manager.getRepository(UserRoleEntity);

      // See the note in update(): neither entity has a @DeleteDateColumn, so
      // we set `deleted_at` via update() rather than Repository#softDelete().
      // Role assignments are cleared first — the same trigger raises on
      // `users` if any active user_roles row still references it.
      await txUserRoles.update({ userId: id }, { deletedAt: new Date() });
      await txUsers.update(id, { deletedAt: new Date() });
    });
  }

  private async findActiveOrThrow(id: string): Promise<UserEntity> {
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Account not found');
    }
    return user;
  }

  private async loadLinkedProfiles(
    userIds: string[],
  ): Promise<Map<string, AccountLinkedProfile>> {
    const map = new Map<string, AccountLinkedProfile>();
    if (userIds.length === 0) {
      return map;
    }

    const lecturers = await this.lecturers.find({
      where: { userId: In(userIds), deletedAt: IsNull() },
    });
    for (const lecturer of lecturers) {
      if (!lecturer.userId) {
        continue;
      }
      map.set(lecturer.userId, {
        type: 'lecturer',
        code: lecturer.employeeCode,
        fullName: lecturer.fullName,
      });
    }

    const students = await this.students.find({
      where: { userId: In(userIds), deletedAt: IsNull() },
    });
    for (const student of students) {
      if (!student.userId || map.has(student.userId)) {
        continue;
      }
      map.set(student.userId, {
        type: 'student',
        code: student.studentCode,
        fullName: student.fullName,
      });
    }

    return map;
  }

  private async toView(
    user: UserEntity,
    linkedProfile: AccountLinkedProfile | null,
  ): Promise<AccountView> {
    const assignments = await this.userRoles.find({
      where: { userId: user.id, deletedAt: IsNull() },
    });
    const roleIds = assignments.map((a) => a.roleId);
    const roles =
      roleIds.length > 0
        ? await this.roles.find({ where: { id: In(roleIds) } })
        : [];

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: roles.map((r) => r.code),
      linkedProfile,
    };
  }
}
