import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { GradingResultEntity, type GradingResultStatus } from './entities/grading-result.entity';
import type { UngradableClass } from './grading-model.types';
import { GRADE_JOB_OPTIONS, GRADING_QUEUE, type GradeSubmissionJob } from './grading.queue';
import { lockTeacherScoring } from './scoring/score-inputs';

/**
 * Chấm lại bài KHÔNG CHẤM ĐƯỢC do lỗi hệ thống (spec §2.3).
 *
 * Không nhầm với `grading-regrade.spec.ts`: file đó nói về lần chấm lại NỘI BỘ đúng một lần khi ≥ 50% dẫn
 * chứng không kiểm chứng được (T-G2-1b). Ở đây là giảng viên bấm nút, cho bài chưa có điểm nào.
 */
export interface RegradeSkip {
  resultId: string;
  /** Câu tiếng Việt để hiện thẳng cho giảng viên — không phải mã lỗi. */
  reason: string;
}

export interface RegradeOutcome {
  requeued: number;
  skipped: RegradeSkip[];
}

export const REGRADE_MESSAGES = {
  in_progress: 'Bài này đang được chấm — chưa cần chấm lại.',
  has_score:
    'Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký.',
  submission_class:
    'Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.',
  not_ungradable: 'Bài này không ở trạng thái không chấm được.',
} as const;

export type RegradeRefusal =
  | { code: 'in_progress'; status: 409; message: string }
  | { code: 'has_score'; status: 400; message: string }
  | { code: 'submission_class'; status: 400; message: string }
  | { code: 'not_ungradable'; status: 400; message: string };

/**
 * Bài này có được chấm lại không — và nếu không thì vì sao.
 *
 * Hàm THUẦN vì thứ tự kiểm là thứ dễ hỏng nhất ở đây: bấm hai lần thì lần hai bài đã ở `ai_grading` với lớp
 * lý do là NULL; kiểm "lớp ≠ system" TRƯỚC sẽ trả "bài làm không đọc được" — một lời nói dối. Trạng thái
 * phải đi trước, rồi điểm, rồi lớp.
 */
export function regradeRefusal(row: {
  status: GradingResultStatus;
  aiTotalScore: string | null;
  ungradableClass: UngradableClass | null;
}): RegradeRefusal | null {
  if (row.status === 'ai_grading' || row.status === 'ai_graded') {
    return { code: 'in_progress', status: 409, message: REGRADE_MESSAGES.in_progress };
  }
  if (row.status !== 'flagged_for_review' || row.aiTotalScore !== null) {
    return { code: 'has_score', status: 400, message: REGRADE_MESSAGES.has_score };
  }
  if (row.ungradableClass === 'submission') {
    return { code: 'submission_class', status: 400, message: REGRADE_MESSAGES.submission_class };
  }
  if (row.ungradableClass !== 'system') {
    return { code: 'not_ungradable', status: 400, message: REGRADE_MESSAGES.not_ungradable };
  }
  return null;
}

/** Dòng cần để quyết định và để xếp job — một câu SQL, ba bảng. */
export const REGRADE_ROW_SQL = `
  SELECT g.id, g.status, g.ai_total_score, g.ungradable_class, g.ungradable_reason,
         g.submission_id, g.rubric_id_version, rd.required_filename, rd.deliverable_type
    FROM examcollect.grading_result g
    JOIN examcollect.submission s ON s.id = g.submission_id
    JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id`;

interface RegradeRow {
  id: string;
  status: GradingResultStatus;
  aiTotalScore: string | null;
  ungradableClass: UngradableClass | null;
  submissionId: string;
  rubricId: string;
  requiredFilename: string;
  deliverableType: GradeSubmissionJob['deliverableType'];
}

function toRow(raw: Record<string, unknown>): RegradeRow {
  return {
    id: raw.id as string,
    status: raw.status as GradingResultStatus,
    aiTotalScore: (raw.ai_total_score as string | null) ?? null,
    ungradableClass: (raw.ungradable_class as UngradableClass | null) ?? null,
    submissionId: raw.submission_id as string,
    rubricId: raw.rubric_id_version as string,
    requiredFilename: raw.required_filename as string,
    deliverableType: raw.deliverable_type as GradeSubmissionJob['deliverableType'],
  };
}

const SKIP_MOVED_ON = 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.';

@Injectable()
export class RegradeService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectQueue(GRADING_QUEUE) private readonly queue: Queue<GradeSubmissionJob>,
  ) {}

  /** Quyền sở hữu do controller kiểm TRƯỚC (`findResultForOwner`); ở đây chỉ quyết được-hay-không. */
  async regradeOne(teacherId: string, resultId: string): Promise<RegradeOutcome> {
    const [raw] = await this.ds.query(`${REGRADE_ROW_SQL} WHERE g.id = $1`, [resultId]);
    if (!raw) throw new NotFoundException('Grading result not found');
    const row = toRow(raw);

    const refusal = regradeRefusal(row);
    if (refusal) {
      throw refusal.status === 409
        ? new ConflictException(refusal.message)
        : new BadRequestException(refusal.message);
    }
    return this.requeue(teacherId, row);
  }

  /**
   * Chấm lại MỌI bài lớp system của một phiên — tuỳ chọn chỉ những bài cùng `ungradable_reason`.
   *
   * Một `SELECT` lấy ứng viên rồi gọi `requeue` TUẦN TỰ từng bài, không `UPDATE … WHERE id IN (…)` hàng loạt:
   * mỗi dòng phải qua đúng một UPDATE có điều kiện (hai lượt bấm song song không tạo hai lượt chấm), và
   * `skipped` phải nói được bài NÀO bị bỏ vì sao — một mảng id trần nói không được.
   *
   * Lớp `submission` và bài đã có điểm không bao giờ lọt vào `SELECT`, nên cũng không bao giờ lọt vào lọc theo
   * lý do dù có trùng chữ.
   */
  async regradeUngradable(teacherId: string, examSessionId: string, reason: string | null): Promise<RegradeOutcome> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `${REGRADE_ROW_SQL}
        WHERE s.exam_session_id = $1
          AND g.status = 'flagged_for_review'
          AND g.ungradable_class = 'system'
          AND g.ai_total_score IS NULL
          AND ($2::text IS NULL OR g.ungradable_reason = $2)
        ORDER BY g.id`,
      [examSessionId, reason],
    );
    const outcome: RegradeOutcome = { requeued: 0, skipped: [] };
    for (const raw of rows) {
      const one = await this.requeue(teacherId, toRow(raw));
      outcome.requeued += one.requeued;
      outcome.skipped.push(...one.skipped);
    }
    return outcome;
  }

  /**
   * Đưa MỘT bài về `ai_grading` rồi xếp job.
   *
   * UPDATE có điều kiện trong một transaction, dưới khoá chấm điểm của giảng viên (cùng thứ tự khoá với
   * `markUngradable` và `startAttempt`). Lớp và lý do bị xoá Ở CHÍNH CÂU LỆNH NÀY: `ck_grading_result_ungradable`
   * cấm một lớp đi kèm điểm, mà `gradeOneShot` không bao giờ xoá nó — giữ lại thì lần ghi điểm đầu tiên nổ.
   * Không dùng `advanceStatus`: `AdvanceExtra` không cho đặt các cột này.
   *
   * Đổi trạng thái TRƯỚC, xếp job SAU: `lockRunning` của đường điều tra đòi bài đang ở `ai_grading`.
   */
  private async requeue(teacherId: string, row: RegradeRow): Promise<RegradeOutcome> {
    const moved = await this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const updated = await m
        .createQueryBuilder()
        .update(GradingResultEntity)
        .set({
          status: 'ai_grading',
          ungradableClass: null,
          ungradableReason: null,
          flagForReview: false,
          confidence: null,
        })
        .where('id = :id', { id: row.id })
        .andWhere("status = 'flagged_for_review'")
        .andWhere("ungradable_class = 'system'")
        .andWhere('ai_total_score IS NULL')
        .execute();
      return (updated.affected ?? 0) > 0;
    });
    if (!moved) return { requeued: 0, skipped: [{ resultId: row.id, reason: SKIP_MOVED_ON }] };

    await this.enqueue(teacherId, row);
    return { requeued: 1, skipped: [] };
  }

  /**
   * Xếp job cho một bài vừa được đưa về `ai_grading`.
   *
   * `jobId` cố định (`grade-<submissionId>`) là cách loại trùng — nhưng cũng là cái bẫy: BullMQ giữ job hoàn tất
   * 24 giờ (`removeOnComplete.age`) và job hỏng mãi mãi (`removeOnFail: false`), và `queue.add` cùng `jobId` với
   * một job ĐANG TỒN TẠI bị bỏ qua IM LẶNG. Một lượt "không chấm được" kết thúc bình thường (`finishUngradable`
   * không ném) nên job của nó là `completed`; không xoá nó thì bài kẹt ở `ai_grading` không job nào. Nếu
   * bước này lỗi giữa chừng thì `regradeStuck` là lưới cứu: nó cũng gỡ job `completed` cũ của dòng đang ở `ai_grading`.
   *
   * Job SỐNG thì để yên: nó đọc DB lúc chạy và chấm đúng bài này.
   */
  private async enqueue(teacherId: string, row: RegradeRow): Promise<void> {
    const jobId = `grade-${row.submissionId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else if (state !== 'unknown') {
        return; // active / waiting / delayed / prioritized / waiting-children: đã có việc sắp chạy
      }
    }
    await this.queue.add(
      'grade-submission',
      {
        resultId: row.id,
        submissionId: row.submissionId,
        requiredFilename: row.requiredFilename,
        deliverableType: row.deliverableType,
        rubricId: row.rubricId,
        teacherId,
      } satisfies GradeSubmissionJob,
      { ...GRADE_JOB_OPTIONS, jobId },
    );
  }
}
