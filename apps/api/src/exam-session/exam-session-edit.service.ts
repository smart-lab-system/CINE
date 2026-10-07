import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { RoomService } from '../course/room.service';
import { CancelExamSessionDto, UpdateExamSessionDto } from './dto/update-exam-session.dto';
import { ExamSessionResponseDto } from './dto/exam-session-response.dto';
import { ExamSessionEntity } from './entities/exam-session.entity';
import {
  CANCEL_HAS_PRESENCE_MESSAGE,
  cancelStatusProblem,
  editWindowProblem,
  timeProblems,
} from './exam-session-edit.rules';
import { ExamSessionService } from './exam-session.service';
import { ScheduleConflictService } from './schedule-conflict.service';

/**
 * Sửa và huỷ phiên thi của giảng viên (spec §4.1). Tách khỏi `ExamSessionService` (đã vượt ngưỡng 500 dòng của CLAUDE.md) vì
 * đây là hai phép ghi có luật riêng; luật THUẦN nằm ở `exam-session-edit.rules.ts`.
 *
 * Cả hai ghi bằng MỘT câu `UPDATE` có điều kiện rồi kiểm số dòng bị ảnh hưởng, giống `finalizeExamSession`: đọc trước rồi ghi
 * vô điều kiện sẽ để một phiên vừa bắt đầu (hoặc vừa có người vào) vẫn bị sửa/huỷ. Các kiểm tra đọc-trước ở đây chỉ để cho
 * câu báo lỗi ĐỌC ĐƯỢC; điều kiện thật nằm trong câu `UPDATE`, và ràng buộc exclusion của DB vẫn là thẩm quyền cuối về chồng
 * lịch (vi phạm lọt qua → 23P01 → 409 chung qua `PostgresExceptionFilter`).
 */
@Injectable()
export class ExamSessionEditService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly examSessions: ExamSessionService,
    private readonly rooms: RoomService,
    private readonly scheduleConflicts: ScheduleConflictService,
    private readonly auditLog: AuditLogService,
  ) {}

  async update(id: string, teacherId: string, dto: UpdateExamSessionDto): Promise<ExamSessionResponseDto> {
    // 404 khi không có, 403 khi của người khác.
    const session = await this.examSessions.findEntityForOwner(id, teacherId);
    const now = new Date();

    const windowProblem = editWindowProblem(session, now);
    if (windowProblem) throw new ConflictException(windowProblem);

    if (
      dto.name === undefined &&
      dto.roomId === undefined &&
      dto.startTime === undefined &&
      dto.endTime === undefined &&
      dto.examType === undefined
    ) {
      throw new BadRequestException('Hãy gửi ít nhất một trường cần sửa: name, roomId, startTime, endTime hoặc examType.');
    }

    const next = {
      name: dto.name ?? session.name,
      examType: dto.examType ?? session.examType,
      startTime: dto.startTime ? new Date(dto.startTime) : session.startTime,
      endTime: dto.endTime ? new Date(dto.endTime) : session.endTime,
    };
    const roomChanged = dto.roomId !== undefined && dto.roomId !== session.roomId;
    const timeChanged =
      next.startTime.getTime() !== session.startTime.getTime() || next.endTime.getTime() !== session.endTime.getTime();
    const nameChanged = next.name !== session.name;
    const typeChanged = next.examType !== session.examType;
    if (!roomChanged && !timeChanged && !nameChanged && !typeChanged) {
      // Gửi đúng giá trị hiện có: không có gì để ghi, và một dòng audit "đổi X thành X" là nhiễu.
      return this.examSessions.findByIdForOwner(id, teacherId);
    }

    // Lỗi đầu vào (400) trước xung đột (409) — như `create`. Kiểm trên CẶP sau khi sửa, kể cả khi chỉ gửi một đầu.
    const problems = timeProblems(next.startTime, next.endTime, now);
    if (problems.length > 0) throw new BadRequestException(problems.join(' '));

    // Phòng MỚI phải đang hoạt động. Giữ phòng hiện tại — kể cả khi admin đã tắt nó sau khi phiên được tạo — thì không kiểm.
    const room = roomChanged ? await this.rooms.requireActiveForNewSession(dto.roomId!) : null;
    const roomId = room?.id ?? session.roomId;

    if (roomChanged || timeChanged) {
      // `excludeSessionId`: chính phiên này không được tính là va chạm với chính nó (một phiên dời sang khoảng chồng lên
      // khoảng cũ của nó sẽ báo trùng phòng, trùng lớp và vi phạm giãn cách với CHÍNH NÓ nếu thiếu tham số này).
      await this.scheduleConflicts.assertNone({
        roomId,
        classId: session.classId,
        teacherId: session.teacherId,
        startTime: next.startTime,
        endTime: next.endTime,
        excludeSessionId: session.id,
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(ExamSessionEntity)
        .set({
          name: next.name,
          examType: next.examType,
          startTime: next.startTime,
          endTime: next.endTime,
          ...(room ? { roomId: room.id, roomName: room.name } : {}),
        })
        .where('id = :id', { id })
        .andWhere('status = :active', { active: 'active' })
        // Cửa sổ kiểm lại NGAY TRONG câu ghi: một phiên bắt đầu giữa lúc đọc và lúc ghi vẫn không bị sửa.
        // (Giới hạn đã biết, review cụm F, M8: một lượt `agent:join` đọc bản CŨ ngay trước khi giao dịch này commit vẫn vào với
        // phòng/giờ cũ. Cửa sổ chỉ bằng thời gian của giao dịch và chỉ xảy ra sát giờ bắt đầu.)
        .andWhere('start_time > now()')
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new ConflictException(
          'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.',
        );
      }

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = { targetLabel: next.name, code: session.code };
      if (nameChanged) {
        oldValue.name = session.name;
        newValue.name = next.name;
      }
      if (roomChanged) {
        oldValue.room = session.roomName;
        newValue.room = room!.name;
      }
      if (next.startTime.getTime() !== session.startTime.getTime()) {
        oldValue.startTime = session.startTime.toISOString();
        newValue.startTime = next.startTime.toISOString();
      }
      if (next.endTime.getTime() !== session.endTime.getTime()) {
        oldValue.endTime = session.endTime.toISOString();
        newValue.endTime = next.endTime.toISOString();
      }
      if (typeChanged) {
        oldValue.examType = session.examType;
        newValue.examType = next.examType;
      }
      await this.auditLog.recordUserAction(
        {
          actorId: teacherId,
          action: 'exam_session.update',
          targetType: 'exam_session',
          targetId: id,
          oldValue,
          newValue,
        },
        manager,
      );
    });

    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  async cancel(id: string, teacherId: string, dto: CancelExamSessionDto): Promise<ExamSessionResponseDto> {
    const session = await this.examSessions.findEntityForOwner(id, teacherId);

    // Idempotent như `finalize`: huỷ lại một phiên đã huỷ không phải lỗi, và không ghi audit lần hai.
    if (session.status === 'cancelled') {
      return this.examSessions.findByIdForOwner(id, teacherId);
    }
    const statusProblem = cancelStatusProblem(session.status);
    if (statusProblem) throw new ConflictException(statusProblem);

    await this.dataSource.transaction(async (manager) => {
      // Cả ba điều kiện nằm TRONG câu `UPDATE`: một em vào phòng giữa lúc kiểm và lúc ghi vẫn chặn được việc huỷ.
      //
      // GIỚI HẠN ĐÃ BIẾT (review cụm F, M7): một lượt `agent:join` đã đọc `active` nhưng CHƯA ghi sự kiện kết nối vẫn lọt qua việc
      // huỷ. Giữa hai việc đó gateway còn vài truy vấn và một lần gọi kho lưu trữ, nên cửa sổ là cỡ thời gian MỘT lượt join chứ
      // không phải mili-giây. Hậu quả: em đó nhận ack vào một phiên đã huỷ, không có sự kiện socket nào báo, và chỉ bị từ chối
      // khi nộp bài. Cần đúng lúc giảng viên huỷ một phiên ĐÃ bắt đầu mà chưa ai vào. Cách rẻ nhất nếu cần đóng nó: phát một sự
      // kiện tới phòng agent của phiên sau khi commit huỷ.
      const result = await manager
        .createQueryBuilder()
        .update(ExamSessionEntity)
        .set({ status: 'cancelled' })
        .where('id = :id', { id })
        .andWhere('status = :active', { active: 'active' })
        .andWhere('NOT EXISTS (SELECT 1 FROM examcollect.agent_connection_event e WHERE e.exam_session_id = :id)')
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM examcollect.submission sub WHERE sub.exam_session_id = :id AND sub.status = 'collected')`,
        )
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new ConflictException(await this.whyNotCancellable(manager, id));
      }

      await this.auditLog.recordUserAction(
        {
          actorId: teacherId,
          action: 'exam_session.cancel',
          targetType: 'exam_session',
          targetId: id,
          oldValue: { status: 'active' },
          newValue: {
            targetLabel: session.name,
            code: session.code,
            status: 'cancelled',
            ...(dto.reason ? { reason: dto.reason } : {}),
          },
        },
        manager,
      );
    });

    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  /** Câu báo lỗi sau khi `UPDATE` huỷ không khớp dòng nào: nói ĐÚNG lý do ở thời điểm này (đã có người vào, hay trạng thái đổi). */
  private async whyNotCancellable(manager: EntityManager, id: string): Promise<string> {
    const [row] = await manager.query(
      `SELECT s.status,
              EXISTS (SELECT 1 FROM examcollect.agent_connection_event e WHERE e.exam_session_id = s.id) AS "hasEvents",
              EXISTS (SELECT 1 FROM examcollect.submission sub WHERE sub.exam_session_id = s.id AND sub.status = 'collected') AS "hasCollected"
         FROM examcollect.exam_session s WHERE s.id = $1`,
      [id],
    );
    if (row.status === 'active' && (row.hasEvents || row.hasCollected)) {
      return CANCEL_HAS_PRESENCE_MESSAGE;
    }
    return cancelStatusProblem(row.status) ?? CANCEL_HAS_PRESENCE_MESSAGE;
  }
}
