import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TestRunCaseResult, TestRunKind, TestRunStatus } from '../entities/grading-test-run.entity';

/** Dòng `running` quá hạn này được coi là đã chết (tiến trình sập giữa chừng) và được đóng bằng `aborted`. */
export const STALE_RUNNING_MINUTES = 15;
/** Tên unique index từng phần: mỗi phiên tối đa một dòng `running`. */
const ONE_RUNNING_INDEX = 'uq_grading_test_run_one_running';

export interface BeginRun {
  sessionId: string;
  problemId: string | null;
  /** Null ở lượt sinh đang chạy: gói chưa có, `finish` điền sau. */
  bundleId: string | null;
  kind: TestRunKind;
  caseKey: string | null;
  sourceSha256: string | null;
  teacherId: string;
}

export interface FinishRun {
  host?: Record<string, unknown> | null;
  cases?: TestRunCaseResult[];
  /** Điền khi lượt sinh vừa tạo gói. `COALESCE`: không ghi đè một giá trị đã có bằng null. */
  testBundleId?: string | null;
  sourceSha256?: string | null;
  /** Chỉ lượt sinh. `costUsd` null khi chưa khai giá model. */
  usage?: { promptVersion: string; modelUsed: string; tokensIn: number; tokensOut: number; costUsd: number | null };
}

/**
 * Sổ các lượt chạy (`grading_test_run`): chỗ DUY NHẤT ghi và đóng dòng, dùng chung cho chạy thử và lượt sinh gói.
 * SQL thô vì bảng có trigger (đúng một UPDATE từ `running` sang trạng thái kết thúc, không xoá); service kiểm trước,
 * trigger chỉ là lưới cuối.
 */
@Injectable()
export class TestRunStore {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Phiên có dòng `running` còn sống không? Kiểm TRƯỚC khi tốn hạn mức hay gọi LLM. Dòng chết được đóng trước. */
  async hasLiveRun(sessionId: string): Promise<boolean> {
    await this.closeStale(sessionId);
    const [row] = await this.ds.query(`SELECT 1 FROM examcollect.grading_test_run WHERE exam_session_id = $1 AND status = 'running' LIMIT 1`, [sessionId]);
    return row !== undefined;
  }

  /** INSERT dòng `running`. Unique index từng phần làm lượt thứ hai nhận 409, kể cả khi hai request đến cùng lúc. */
  async begin(input: BeginRun): Promise<string> {
    // Dòng chết (quá hạn) được đóng trước, nếu không nó chặn phiên mãi mãi. UPDATE này được trigger cho phép
    // (running → trạng thái kết thúc, các trường khác giữ nguyên).
    await this.closeStale(input.sessionId);
    try {
      const [row] = await this.ds.query(
        `INSERT INTO examcollect.grading_test_run
           (exam_session_id, problem_id, test_bundle_id, kind, case_key, source_sha256, requested_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'running') RETURNING id`,
        [input.sessionId, input.problemId, input.bundleId, input.kind, input.caseKey, input.sourceSha256, input.teacherId],
      );
      return row.id as string;
    } catch (error) {
      const driver = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
      if (driver?.code === '23505' && driver.constraint === ONE_RUNNING_INDEX) {
        throw new ConflictException(busyMessage(input.kind));
      }
      throw error;
    }
  }

  /**
   * Đúng MỘT UPDATE: từ `running` sang trạng thái kết thúc (trigger `trg_grading_test_run_finish_once`). `manager` để lượt
   * sinh đóng dòng TRONG transaction ghi gói và thước: hỏng giữa chừng thì không có gói nào mà dòng đã báo kết thúc.
   */
  async finish(runId: string, status: TestRunStatus, result: FinishRun = {}, manager?: EntityManager): Promise<void> {
    const db = manager ?? this.ds;
    const u = result.usage;
    await db.query(
      `UPDATE examcollect.grading_test_run
          SET status = $2, finished_at = now(), host = $3::jsonb, cases = $4::jsonb,
              test_bundle_id = COALESCE($5, test_bundle_id), source_sha256 = COALESCE($6, source_sha256),
              prompt_version = $7, model_used = $8, tokens_in = $9, tokens_out = $10, cost_usd = $11
        WHERE id = $1 AND status = 'running'`,
      [
        runId,
        status,
        result.host == null ? null : JSON.stringify(result.host),
        JSON.stringify(result.cases ?? []),
        result.testBundleId ?? null,
        result.sourceSha256 ?? null,
        u?.promptVersion ?? null,
        u?.modelUsed ?? null,
        u?.tokensIn ?? null,
        u?.tokensOut ?? null,
        u?.costUsd ?? null,
      ],
    );
  }

  private async closeStale(sessionId: string): Promise<void> {
    await this.ds.query(
      `UPDATE examcollect.grading_test_run SET status = 'aborted', finished_at = now()
        WHERE exam_session_id = $1 AND status = 'running'
          AND requested_at < now() - make_interval(mins => $2::int)`,
      [sessionId, STALE_RUNNING_MINUTES],
    );
  }
}

/** Lời 409 theo loại lượt: chạy thử và sinh gói là hai việc giảng viên đang chờ khác nhau. */
export function busyMessage(kind: TestRunKind): string {
  return kind === 'test_run'
    ? 'Phiên này đang chạy thử một lượt khác — chờ lượt đó xong rồi bấm lại.'
    : 'Phiên này đang sinh gói test — chờ lượt đó xong rồi bấm lại.';
}
