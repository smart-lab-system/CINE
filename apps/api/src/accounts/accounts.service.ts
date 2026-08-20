import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

export interface AccountView {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: string;
  roles: string[];
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
  ) {}

  async create(dto: CreateAccountDto): Promise<{ id: string }> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.users.save(
      this.users.create({
        username: dto.username,
        email: dto.email ?? null,
        passwordHash,
        displayName: dto.displayName,
        status: 'active',
      }),
    );

    const roles = await this.roles.find({ where: { code: In(dto.roleCodes) } });
    await this.userRoles.save(
      roles.map((role) =>
        this.userRoles.create({ userId: user.id, roleId: role.id }),
      ),
    );

    return { id: user.id };
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
    const items = await Promise.all(users.map((u) => this.toView(u)));

    return { items, total };
  }

  async update(id: string, dto: UpdateAccountDto): Promise<AccountView> {
    const user = await this.findActiveOrThrow(id);

    await this.users.update(id, {
      email: dto.email ?? user.email,
      displayName: dto.displayName ?? user.displayName,
      status: dto.status ?? user.status,
    });

    if (dto.roleCodes) {
      // UserRoleEntity models `deleted_at` as a plain @Column, not a
      // @DeleteDateColumn, so Repository#softDelete() would throw
      // MissingDeleteDateColumnError. Setting the column directly via
      // update() has the identical effect for the DB's soft-delete trigger.
      await this.userRoles.update({ userId: id }, { deletedAt: new Date() });
      const roles = await this.roles.find({ where: { code: In(dto.roleCodes) } });
      await this.userRoles.save(
        roles.map((role) =>
          this.userRoles.create({ userId: id, roleId: role.id }),
        ),
      );
    }

    const updated = await this.findActiveOrThrow(id);
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    // See the note in update(): neither entity has a @DeleteDateColumn, so
    // we set `deleted_at` via update() rather than Repository#softDelete().
    // Role assignments are cleared first — the DDL's
    // guard_master_soft_delete trigger raises on `users` if any active
    // user_roles row still references it.
    await this.userRoles.update({ userId: id }, { deletedAt: new Date() });
    await this.users.update(id, { deletedAt: new Date() });
  }

  private async findActiveOrThrow(id: string): Promise<UserEntity> {
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Account not found');
    }
    return user;
  }

  private async toView(user: UserEntity): Promise<AccountView> {
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
    };
  }
}
