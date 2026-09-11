import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ClassEntity } from '../../course/entities/class.entity';
import { ExamSessionEntity } from './exam-session.entity';

export type SessionRosterSource = 'frozen' | 'manual';

/**
 * Ai ĐÁNG LẼ phải có mặt ở phiên thi này — chụp cứng lúc mở phiên
 * (CLAUDE.md §7.1.1).
 *
 * Vì sao không đọc `enrollment` trực tiếp lúc chấm hay lúc xuất bảng
 * điểm: roster lớp sửa được bất kỳ lúc nào, kể cả sau khi đã thi và đã
 * chấm. Không có bảng này thì không tồn tại bản ghi nào trả lời được
 * "danh sách lúc thi trông ra sao" — một sinh viên rút môn sau kỳ thi
 * làm điểm cũ biến mất khỏi bảng, và "45 có mặt / 46 bài nộp" không
 * kiểm chứng lại được.
 *
 * `home_class_id` / `home_teacher_id` COPY theo, không join lại: đây là
 * định tuyến tại THỜI ĐIỂM THI. Lớp đổi giảng viên sau đó không được
 * đổi nơi bài thi hôm ấy chảy về — cùng lý do `enrollment` giữ hai cột
 * này thay vì suy ra.
 *
 * Không có cột `frozen_at`: `created_at` của BaseEntity đã là đúng thời
 * điểm đó. Hai cột cùng nghĩa, cùng `default now()`, là một cái bẫy —
 * sau này sửa một cột mà quên cột kia thì chúng lệch và không ai biết
 * cột nào đúng.
 */
@Entity({ name: 'session_roster' })
@Index('uq_session_roster_session_student', ['examSessionId', 'studentMssv'], { unique: true })
@Check('ck_session_roster_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
export class SessionRosterEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  /** `citext` như mọi nơi khác giữ MSSV: `SV001` và `sv001` là MỘT sinh
   *  viên, và chỉ số duy nhất ở trên dựa vào điều đó. */
  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({ name: 'student_name', type: 'varchar', length: 150 })
  studentName!: string;

  @Column({ name: 'home_class_id', type: 'uuid' })
  homeClassId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity;

  @Column({ name: 'home_teacher_id', type: 'uuid' })
  homeTeacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity;

  /**
   * `frozen` = chép từ enrollment lúc mở phiên. `manual` = giảng viên
   * thêm tay tại phòng thi (§5.8).
   *
   * Cờ này là lý do việc đóng băng không phá đường thoát hiểm đó: thêm
   * tay vẫn được, nhưng đọc ra được là thêm tay — nên một danh sách
   * toàn `manual` nói ngay rằng ảnh chốt đã chụp vào lúc roster còn
   * trống.
   */
  @Column({
    type: 'enum',
    enum: ['frozen', 'manual'],
    enumName: 'session_roster_source',
    default: 'frozen',
  })
  source!: SessionRosterSource;
}
