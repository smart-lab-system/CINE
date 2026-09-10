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
  isActive: boolean;
  createdAt: Date;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Teacher accounts as a pick list: id and name, nothing else.
   *
   * A Trưởng khoa has to name a lecturer when creating a class, but has no
   * business seeing emails, roles or timestamps — so this is a deliberately
   * narrower shape than search(), not a relaxation of the admin-only guard
   * on it.
   */
  async listTeacherOptions(): Promise<Array<{ id: string; name: string }>> {
    return this.accounts.find({
      where: { role: 'teacher' },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

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

    if (query.role) {
      qb.andWhere('a.role = :role', { role: query.role });
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

  /**
   * Đường thật cho nhân sự nghỉ việc, thay cho `remove()` — cái sẽ bị FK
   * RESTRICT chặn ngay khi tài khoản đã dạy bất cứ thứ gì (CLAUDE.md
   * §7.2.8). Không xoá gì, không đụng FK nào; chỉ chặn đăng nhập và
   * refresh (xem `AuthService`).
   *
   * Không audit: đây là tầng Tham chiếu, và cột `is_active` cùng
   * `updated_at` đã tự nói ra trạng thái hiện tại. Audit dành cho thao
   * tác đổi AI ĐỌC ĐƯỢC GÌ (§7.2.6) — khoá đăng nhập không mở rộng quyền
   * đọc của bất kỳ ai.
   */
  async deactivate(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.accounts.update(id, { isActive: false });
  }

  async reactivate(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.accounts.update(id, { isActive: true });
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
      isActive: account.isActive,
      createdAt: account.createdAt,
    };
  }
}
