import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';
import { ExamMaterialEntity } from '../../exam-session/entities/exam-material.entity';

/**
 * Đề bài và đáp án mẫu của MỘT phiên thi — ngữ cảnh mà model cần để phán
 * đoán một bài làm lệch rubric.
 *
 * Bảng này tồn tại vì một câu hỏi mà rubric không trả lời được: *"bài này
 * không làm theo hướng rubric mong đợi, nhưng nó có ĐÚNG không?"* Trả lời
 * được câu đó đòi hỏi biết đề hỏi gì và thầy chấm thế nào — hai thứ chưa
 * từng đi vào prompt.
 *
 * ĐÁP ÁN MẪU TUYỆT ĐỐI KHÔNG ĐƯỢC LƯU Ở `exam_material`.
 * `ExamMaterialService.listForAgent()` trả về mọi dòng của bảng đó kèm URL
 * tải ngay khi qua `start_time`, không lọc theo loại — để nhầm chỗ là gửi
 * đáp án về máy cả 40 sinh viên. Khoá storage của nó nằm dưới prefix
 * `grading-reference/`, và không đường code nào ở phía agent ký URL cho
 * prefix ấy.
 *
 * Đề bài thì ngược lại: nó VỐN ĐÃ ở `exam_material` vì sinh viên phải tải
 * được. Bảng này chỉ TRỎ tới nó (`question_material_id`), không chép lại —
 * hai bản sao của cùng một file là cách chúng lệch nhau.
 *
 * Một phiên MỘT bản (`uq_grading_reference_session`), và bản ấy bị ĐÓNG
 * BĂNG khi phiên đã có kết quả chấm: 20 bài đầu chấm có đáp án mẫu, 20 bài
 * sau chấm với đáp án đã sửa, là hai kỳ thi khác nhau đội lốt một. Cùng
 * luật với `setSessionRubric`.
 */
@Entity({ name: 'grading_reference' })
@Index('uq_grading_reference_session', ['examSessionId'], { unique: true })
export class GradingReferenceEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'exam_session_id' })
  examSession?: ExamSessionEntity;

  /**
   * File nào trong số đã upload LÀ đề bài.
   *
   * Giảng viên chỉ rõ, hệ thống KHÔNG đoán theo tên file — một phiên có
   * thể có đề + dataset + starter code, và Security rule 9 cấm đúng loại
   * suy đoán này (`GradeExport` cũng bắt chỉ rõ cột dù header ghi "MSSV"
   * rành rành).
   */
  @Column({ name: 'question_material_id', type: 'uuid', nullable: true })
  questionMaterialId!: string | null;

  @ManyToOne(() => ExamMaterialEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'question_material_id' })
  questionMaterial?: ExamMaterialEntity | null;

  /** Dưới prefix `grading-reference/` — không bao giờ qua `listForAgent`. */
  @Column({ name: 'model_answer_storage_key', type: 'text', nullable: true })
  modelAnswerStorageKey!: string | null;

  @Column({ name: 'model_answer_filename', type: 'varchar', length: 255, nullable: true })
  modelAnswerFilename!: string | null;

  /**
   * Lối vào rẻ nhất cho giảng viên: một câu, không cần file.
   *
   * Nhiều khi thứ cần nói không phải cả trang đáp án mà là một dòng:
   * *"Câu 2 chấp nhận cả cách dùng quy hoạch động, không bắt buộc đệ quy."*
   * Dòng đó đáng giá hơn cả trang đáp án, và nó vào thẳng phần cache.
   */
  @Column({ name: 'model_answer_note', type: 'text', nullable: true })
  modelAnswerNote!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdByAccount?: AccountEntity;
}
