import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

// `super_admin`/`department_admin` are accepted values but have no tiering
// logic behind them yet — CLAUDE.md marks tiered Department/Super-Admin as
// out of scope for the MVP. They're here so the column doesn't need a
// migration when that's built later; nothing in the app currently branches
// on them beyond `admin`-equivalence.
export type AccountRole = 'admin' | 'teacher' | 'super_admin' | 'department_admin';

// Single table for both Teacher and Admin: same organization, same login
// flow, no business reason to keep them apart — merging also removes the
// polymorphic-actor problem audit_log would otherwise have.
//
// Student never gets a row here — the Agent authenticates against
// `enrollment` directly (see CLAUDE.md), not against a login account.
@Entity({ name: 'account' })
@Check('ck_account_password_hash_length', 'length(password_hash) >= 20')
export class AccountEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index('uq_account_email', { unique: true })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: ['admin', 'teacher', 'super_admin', 'department_admin'],
    enumName: 'account_role',
  })
  role!: AccountRole;

  // Xoá cứng một Account đã dạy một lớp là bất khả, và đúng như vậy: FK
  // RESTRICT (class.teacher_id, enrollment.home_teacher_id,
  // exam_session.teacher_id) chặn ở tầng DB, còn audit_log thì bất biến.
  // Đây là công cụ thật cho nhân sự nghỉ việc: chặn đăng nhập ngay, không
  // xoá gì, không phá FK nào đang trỏ vào account này.
  //
  // Chỉ `login`/`refresh` đọc cột này — access token đã cấp vẫn sống hết
  // TTL của nó (15 phút). Trần thời gian đó là có chủ ý: kiểm tra
  // is_active trên MỌI request nghĩa là một query account cho mỗi lời gọi
  // API, đổi lấy 15 phút mà một tài khoản vừa bị khoá vẫn thao tác được.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
