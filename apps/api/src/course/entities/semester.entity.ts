import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

@Entity({ name: 'semester' })
@Check('ck_semester_dates', 'end_date >= start_date')
// Tối đa MỘT kỳ hiện hành. Partial index chứ không unique thường: nhiều kỳ
// is_current = false là bình thường, chỉ `true` mới phải là duy nhất. Cho phép
// cả trạng thái KHÔNG kỳ nào hiện hành (DB vừa cài, hoặc Phòng Đào tạo chưa
// gạt) — spec §4.1.
@Index('uq_semester_single_current', ['isCurrent'], {
  unique: true,
  where: '"is_current"',
})
export class SemesterEntity extends BaseEntity {
  // Unique because every Trưởng khoa can create terms in one shared
  // namespace; two "Học kỳ 1 2026-2027" rows would split one real term in
  // two, and nothing on screen would show it.
  @Index('uq_semester_name', { unique: true })
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  /**
   * Kỳ đang hiện hành, do Phòng Đào tạo gạt TƯỜNG MINH — không suy từ
   * start_date/end_date.
   *
   * Suy từ ngày cần một bảng luật tie-break cho ca chồng lấn, và ở ca kỳ hè nó
   * chọn kỳ hè (ngắn, ít người dạy) làm mặc định cho TOÀN BỘ giảng viên, kể cả
   * người không dạy hè. Xem spec §2.2.
   *
   * start_date/end_date vẫn ở lại nhưng đổi vai: chúng không chọn gì nữa, chỉ
   * là điều kiện cho chuông báo "kỳ hiện hành đã kết thúc N ngày trước" — cờ
   * không tự sửa như việc suy-từ-ngày, nên phải nói ra.
   */
  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;
}
