import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { ExamSessionService } from './exam-session.service';

/**
 * Hai trạng thái vòng đời giảng viên tự đặt cho phiên thi của mình.
 *
 * Tách khỏi ExamSessionService có chủ đích: file đó đã ~454 dòng và lo việc
 * tạo/tìm/chốt phiên; đây là bốn phép ghi cột đơn giản, gộp vào chỉ làm file
 * kia vượt ngưỡng 500 dòng của CLAUDE.md mà không được gì.
 *
 * Mọi method đi qua findEntityForOwner trước, nên luật 404/403 giống hệt mọi
 * route phiên thi khác — không có luật quyền riêng ở đây.
 */
@Injectable()
export class SessionLifecycleService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    private readonly examSessions: ExamSessionService,
  ) {}

  async archive(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'archivedAt', new Date());
  }

  async unarchive(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'archivedAt', null);
  }

  async closeAttention(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'attentionClosedAt', new Date());
  }

  async reopenAttention(id: string, teacherId: string): Promise<void> {
    await this.setColumn(id, teacherId, 'attentionClosedAt', null);
  }

  /**
   * Kiểm quyền sở hữu trước, rồi mới ghi. Gọi lại lần hai trên cùng trạng thái
   * là hợp lệ (idempotent theo nghĩa "kết quả cuối giống nhau") — giảng viên
   * bấm hai lần không phải lỗi.
   */
  private async setColumn(
    id: string,
    teacherId: string,
    column: 'archivedAt' | 'attentionClosedAt',
    value: Date | null,
  ): Promise<void> {
    await this.examSessions.findEntityForOwner(id, teacherId);
    await this.sessions.update(id, { [column]: value });
  }
}
