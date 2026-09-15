import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';
import { RubricEntity } from './rubric.entity';
import type { Anchor } from '../ai-provider/anchor.types';

/**
 * Tập anchor đã ĐÓNG BĂNG cho một lượt chấm (A3, spec §10.3).
 *
 * Tạo MỘT LẦN lúc bấm "Bắt đầu chấm", không bao giờ sửa. Bấm lần hai để
 * chấm tiếp phần còn lại phải dùng lại đúng ảnh cũ — nếu không thì chính
 * thao tác resume phá cái mà A3 sinh ra để giữ: bài 1-5 và bài 6-40 được
 * chấm theo hai chuẩn khác nhau trong cùng một phiên.
 *
 * `anchors` rỗng là trạng thái BÌNH THƯỜNG và có nghĩa: "lúc bấm chấm,
 * rubric version này chưa có lần sửa thật nào". Khác hẳn với việc không
 * có dòng nào — cái đó nghĩa là phiên chấm trước khi tính năng tồn tại.
 */
@Index('uq_anchor_snapshot_session', ['examSessionId'], { unique: true })
@Entity({ name: 'grading_anchor_snapshot' })
export class GradingAnchorSnapshotEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  /**
   * Anchor khoá theo rubric version (A1) — lưu lại để sau này còn truy
   * được ảnh chụp này gắn với chuẩn nào, kể cả khi phiên đã đổi rubric.
   */
  @Column({ name: 'rubric_id_version', type: 'uuid' })
  rubricIdVersion!: string;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'rubric_id_version' })
  rubric!: RubricEntity;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  anchors!: Anchor[];
}
