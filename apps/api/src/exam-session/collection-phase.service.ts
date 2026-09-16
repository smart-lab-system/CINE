import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionResponseDto } from './dto/exam-session-response.dto';
import { SUBMISSION_GRACE_PERIOD_MS } from '../submission/submission.types';

/**
 * Vòng đời giai đoạn "Đang thu bài" — spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md §3.
 *
 * Tách khỏi `ExamSessionService` vì file đó đã quá ngưỡng 500 dòng của
 * File Organization Rules, và vì đây là trách nhiệm khác:
 * `ExamSessionService` sở hữu việc tạo/đọc phiên, chỗ này sở hữu đúng
 * hai chuyển trạng thái sau khi hết giờ.
 */
@Injectable()
export class CollectionPhaseService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    private readonly examSessions: ExamSessionService,
  ) {}

  /**
   * "Xác nhận kết thúc": `collecting → completed`, có tên người ký.
   *
   * Mệnh đề `OR` thứ hai là phần dễ bỏ sót nhất (spec §4.3). Tại đúng
   * mốc `end_time + grace`, giảng viên bấm trong khi lượt quét cũng
   * tick; Postgres serialize hai UPDATE và một trong hai match 0 dòng.
   * Nếu lượt quét thắng thì `completed_by = NULL`, và theo §8.1 Plan C
   * Task 3 sẽ KHÔNG được kết luận vắng thi — dù giảng viên thật sự đã
   * đứng trong phòng và xác nhận. Không có cách ưu tiên một bên trong
   * hai UPDATE đồng thời, nên thay vào đó đường của giảng viên nhận cả
   * phiên mà lượt quét vừa đóng.
   *
   * `now() <= end_time + grace` chặn nó thành đường ký khống: sau cửa
   * sổ đó giảng viên đã rời phòng, và "xác nhận" một buổi thi hôm qua
   * không còn là quan sát.
   *
   * `completed_by IS NULL` cũng là thứ giữ `completed_at` không bị ghi
   * đè khi gọi lần hai: phiên đã có người ký không khớp mệnh đề nào.
   */
  async confirmEnd(id: string, teacherId: string): Promise<ExamSessionResponseDto> {
    await this.examSessions.findByIdForOwner(id, teacherId);

    await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'completed', completedAt: () => 'now()', completedBy: teacherId })
      .where('id = :id', { id })
      .andWhere(
        `(status = :collecting
          OR (status = :completed
              AND completed_by IS NULL
              AND now() <= end_time + make_interval(secs => :graceSecs)))`,
        {
          collecting: 'collecting',
          completed: 'completed',
          graceSecs: SUBMISSION_GRACE_PERIOD_MS / 1000,
        },
      )
      .execute();

    // Đọc lại thay vì vá bản sao trong bộ nhớ: nếu 0 dòng khớp (phiên
    // đã có người ký, hoặc đã quá cửa sổ), giảng viên vẫn phải thấy
    // trạng thái thật chứ không phải phỏng đoán. Gọi lần hai vì thế là
    // no-op trả 200, không phải lỗi.
    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  /**
   * Lượt quét dự phòng đóng phiên không ai chốt.
   *
   * `completed_by` để NGUYÊN `NULL` — đó là toàn bộ thông tin mà lượt
   * quét này mang lại: không người nào quan sát buổi thi này (spec
   * §8.1). Một `@Interval` 30 giây không được phép thay giảng viên kết
   * luận điều gì về sinh viên.
   */
  async completeExpired(id: string): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'completed', completedAt: () => 'now()' })
      .where('id = :id', { id })
      .andWhere('status = :collecting', { collecting: 'collecting' })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
