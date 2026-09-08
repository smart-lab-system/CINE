import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Xoá tài khoản gần như KHÔNG phải một thao tác có thật, và đây là chỗ nói ra.
   *
   * 10 bảng trỏ vào `account`, tất cả ON DELETE RESTRICT. Một trong đó là
   * `audit_log.actor_id`, và `audit_log` mang trigger `trg_audit_log_immutable`
   * (BEFORE UPDATE OR DELETE) — nên các dòng chặn KHÔNG THỂ xoá được để giải
   * chặn. Hệ quả: một tài khoản đã từng làm dù chỉ một thao tác được audit thì
   * vĩnh viễn không xoá được.
   *
   * Đó không phải lỗi cần sửa — audit bất biến là yêu cầu bảo mật, và một tài
   * khoản không dấu vết thì audit log mất nghĩa. Cái sai là trả về một 409
   * không nói được vì sao. Chỉ đếm tổng cũng chưa đủ: nó hàm ý "gỡ hết rồi thử
   * lại", một lời khuyên không bao giờ chạy được, tức đúng loại thất bại âm
   * thầm mà việc đếm sinh ra để diệt. Nên tách hai loại.
   *
   * Thứ hệ thống THẬT SỰ cần cho nhân sự nghỉ việc là vô hiệu hoá tài khoản —
   * `account` chưa có cột nào cho việc đó. Feature còn thiếu, không phải bug ở
   * đây; message dưới đây nói thẳng điều đó cho người đang bấm nút.
   */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);

    const [counts] = await this.accounts.query(
      `SELECT
         (SELECT count(*) FROM examcollect.course          WHERE department_head_id = $1) AS courses,
         (SELECT count(*) FROM examcollect.class           WHERE teacher_id         = $1) AS classes,
         (SELECT count(*) FROM examcollect.exam_session    WHERE teacher_id         = $1) AS exam_sessions,
         (SELECT count(*) FROM examcollect.rubric_template WHERE created_by         = $1) AS rubrics,
         (SELECT count(*) FROM examcollect.audit_log       WHERE actor_id           = $1) AS audit_entries`,
      [id],
    );

    const resolvable = {
      courses: Number(counts.courses),
      classes: Number(counts.classes),
      examSessions: Number(counts.exam_sessions),
      rubrics: Number(counts.rubrics),
    };
    const auditLogEntries = Number(counts.audit_entries);
    const resolvableTotal = Object.values(resolvable).reduce((a, b) => a + b, 0);

    if (auditLogEntries > 0) {
      throw new ConflictException({
        message:
          'Tài khoản này đã có lịch sử trong audit log nên không xoá được — audit log là bất biến. ' +
          'Hệ thống chưa có chức năng vô hiệu hoá tài khoản; hãy đổi mật khẩu để chặn đăng nhập.',
        resolvable,
        permanent: { auditLogEntries },
      });
    }

    if (resolvableTotal > 0) {
      throw new ConflictException({
        message:
          'Tài khoản này còn dữ liệu học vụ phụ thuộc. Hãy phân công lại hoặc chuyển giao trước khi xoá.',
        resolvable,
        permanent: { auditLogEntries },
      });
    }

    // Hard delete. Kể cả sau hai lần kiểm trên, FK RESTRICT vẫn là chốt cuối —
    // đếm rồi xoá không phải một thao tác nguyên tử, và 23503 → 409 qua
    // PostgresExceptionFilter là hành vi đúng cho ca đua đó.
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
