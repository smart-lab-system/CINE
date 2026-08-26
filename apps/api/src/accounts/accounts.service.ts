import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AccountEntity, AccountRole } from '../identity/entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

export interface AccountView {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  createdAt: Date;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  async create(dto: CreateAccountDto): Promise<{ id: string }> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    // Single table, single statement — no transaction needed (the old
    // users+user_roles two-table write is gone now that role lives inline
    // on `account`). A duplicate email surfaces as the DB's unique
    // violation (23505), mapped to 409 by PostgresExceptionFilter.
    const saved = await this.accounts.save(
      this.accounts.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
      }),
    );

    return { id: saved.id };
  }

  async search(
    query: SearchAccountsDto,
  ): Promise<{ items: AccountView[]; total: number }> {
    const qb = this.accounts.createQueryBuilder('a');

    if (query.search) {
      qb.andWhere('(a.name ILIKE :term OR a.email ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('a.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((row) => this.toView(row)), total };
  }

  async update(id: string, dto: UpdateAccountDto): Promise<AccountView> {
    const account = await this.findOrThrow(id);

    await this.accounts.update(id, {
      name: dto.name ?? account.name,
      email: dto.email ?? account.email,
      role: dto.role ?? account.role,
    });

    return this.toView(await this.findOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);

    // Hard delete — there's no soft-delete column on `account` any more.
    // FK `ON DELETE RESTRICT` (class.teacher_id, enrollment.home_teacher_id,
    // exam_session.teacher_id, etc.) blocks this at the DB level with a
    // 23503 if the account still owns active academic data —
    // PostgresExceptionFilter maps that to a clean 409, same as before.
    await this.accounts.delete(id);
  }

  private async findOrThrow(id: string): Promise<AccountEntity> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  private toView(account: AccountEntity): AccountView {
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: account.createdAt,
    };
  }
}
