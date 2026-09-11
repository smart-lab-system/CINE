import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { AuditLogService } from '../admin/audit-log.service';

/**
 * Chuyển chủ một `ExamSession` sang giảng viên khác — escape hatch chỉ
 * `admin` dùng được (CLAUDE.md §7.2.6).
 *
 * Lỗ hổng nó vá, ở §5.5: Trưởng khoa đổi `class.teacher_id` không kéo theo
 * các `ExamSession` đã tạo trước đó. Chúng vẫn thuộc giảng viên cũ, và
 * trước file này không role nào có đường sửa — giảng viên mới mở lớp của
 * mình ra và không thấy phiên thi nào.
 *
 * Nhạy cảm hơn `CourseService.assignOwner`: `ExamSession` thuộc tầng SỞ
 * HỮU, nên đổi `teacher_id` đổi luôn ai đọc được bài nộp và điểm đã thu.
 * Audit vì thế là bắt buộc chứ không phải tuỳ chọn, và phải ghi trong CÙNG
 * transaction với lần ghi cột — một dòng audit ghi trên connection khác là
 * một đường để quyền đọc đổi chủ mà không có tên ai bên cạnh.
 *
 * Giảng viên cũ mất quyền đọc NGAY LẬP TỨC, không có thời gian ân hạn: mọi
 * check sở hữu trong codebase này đọc `teacher_id` trực tiếp (xem
 * `ExamSessionService.findOwnedBy`), nên đổi cột là đủ — không có bước
 * "thu hồi quyền" riêng nào tồn tại hay cần tồn tại.
 *
 * Tách khỏi `ExamSessionService` vì file đó đã 541 dòng, quá ngưỡng 500
 * của File Organization Rules; và vì đây là trách nhiệm khác — chuyển chủ
 * có audit, không phải vòng đời phiên thi.
 */
@Injectable()
export class ExamSessionReassignService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly auditLog: AuditLogService,
  ) {}

  async reassignTeacher(
    id: string,
    newTeacherId: string,
    actorId: string,
  ): Promise<ExamSessionEntity> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Exam session not found');
    }

    // Trước mọi kiểm tra khác về tài khoản đích: chuyển từ A sang A không
    // mô tả thay đổi nào, và ghi nó vào sổ chỉ làm loãng sổ.
    if (session.teacherId === newTeacherId) {
      throw new BadRequestException('Phiên thi này đã thuộc giảng viên đó');
    }

    const target = await this.accounts.findOne({
      where: { id: newTeacherId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target || target.role !== 'teacher') {
      // Mọi màn hình của giảng viên lọc theo `teacher_id`. Trỏ cột này vào
      // một admin hoặc Trưởng khoa tạo ra phiên thi không UI nào chạm tới.
      throw new BadRequestException('Chỉ chuyển được phiên thi cho tài khoản giảng viên');
    }
    if (!target.isActive) {
      // Cũng là một cách làm phiên thi biến mất, chỉ chậm hơn một bước.
      throw new BadRequestException('Tài khoản giảng viên này đã bị vô hiệu hoá');
    }

    const previousTeacherId = session.teacherId;

    return this.dataSource.transaction(async (manager) => {
      session.teacherId = newTeacherId;
      const saved = await manager.getRepository(ExamSessionEntity).save(session);

      await this.auditLog.recordUserAction(
        {
          actorId,
          action: 'exam_session.reassign_teacher',
          targetType: 'exam_session',
          targetId: session.id,
          // Cả hai đầu, không chỉ đầu mới: sáu tháng sau, câu hỏi thật là
          // "trước đó phiên này của ai".
          oldValue: { teacherId: previousTeacherId },
          newValue: { teacherId: newTeacherId },
        },
        manager,
      );

      return saved;
    });
  }
}
