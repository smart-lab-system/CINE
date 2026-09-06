import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

// `academic_affairs` là Phòng Đào tạo: tier cấp trường sở hữu lịch học kỳ, và
// chỉ thế. Nó từng tên là `super_admin` — tên THỨ BẬC gán cho một công việc cụ
// thể — và đã đổi (RenameSuperAdminToAcademicAffairs) để tên khớp việc ở mọi
// tầng, đồng thời trả lại `super_admin` cho một tier siêu quản trị thật nếu
// sau này cần.
export type AccountRole = 'admin' | 'teacher' | 'academic_affairs' | 'department_admin';

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
    enum: ['admin', 'teacher', 'academic_affairs', 'department_admin'],
    enumName: 'account_role',
  })
  role!: AccountRole;
}
