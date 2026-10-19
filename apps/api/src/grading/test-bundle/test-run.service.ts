import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { sandboxLanguage } from '../../sandbox/contract';
import { StorageService } from '../../storage/storage.service';
import { GradingReferenceService } from '../grading-reference.service';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../pipeline/investigator-deps';
import { resolveProblemConfig } from '../problem/resolve-problem-config';
import { buildExecRequest, MAX_CASES_PER_JOB, RunStatus, RunSummary, summarizeExec } from './run-source';
import { TestBundleService } from './test-bundle.service';

export interface TestRunResult {
  runId: string;
  status: RunStatus;
  cases: RunSummary['cases'];
  /** Chỉ có khi `compile_error`; không lưu. */
  compileLog?: string;
}

/** Dòng `running` quá hạn này được coi là đã chết (tiến trình sập giữa chừng) và được đóng bằng `aborted`. */
const STALE_RUNNING_MINUTES = 15;
/** Tên unique index từng phần: mỗi phiên tối đa một dòng `running`. */
const ONE_RUNNING_INDEX = 'uq_grading_test_run_one_running';

/**
 * Chạy thử đáp án mẫu của giảng viên trên MỘT phiên bản gói test (G2b-R). Không gọi LLM.
 *
 * Chạy thử KHÔNG đổi duyệt, ghim, `ruler_trust` hay cờ chưa kiểm chứng: một đáp án khớp gói test chỉ chứng tỏ hai thứ
 * nhất quán với nhau, không chứng tỏ đúng (investigator §2.1 luật 4). Service này chỉ ghi `grading_test_run`.
 *
 * Mã nguồn đáp án không đi qua HTTP: đọc từ kho bằng khoá theo băm ở `grading_reference`, rồi đối chiếu băm — object
 * trên kho khác băm đã ghi là dữ liệu hỏng, không chạy.
 */
@Injectable()
export class TestRunService {
  private readonly logger = new Logger(TestRunService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(INVESTIGATOR_DEPS) private readonly deps: InvestigatorDeps,
    private readonly bundles: TestBundleService,
    private readonly references: GradingReferenceService,
    private readonly storage: StorageService,
  ) {}

  async run(sessionId: string, teacherId: string, bundleId: string, caseKey: string | null): Promise<TestRunResult> {
    // Cổng null = máy chạy API chưa khai hàng đợi sandbox. Báo NGAY, trước mọi việc đọc kho hay ghi dòng.
    const sandbox = this.deps.sandbox;
    if (!sandbox) {
      throw new ServiceUnavailableException('Máy chạy bài chưa được cấu hình trên máy chủ này — chưa chạy thử được.');
    }

    // 404 khi gói không thuộc phiên (cùng luật với mọi route gói test).
    const bundle = await this.bundles.get(sessionId, bundleId);

    const cfg = await resolveProblemConfig(this.ds.manager, sessionId);
    const language = sandboxLanguage.safeParse(cfg?.language);
    if (!language.success) {
      throw new BadRequestException('Chạy thử chỉ hỗ trợ bài C++ hoặc Python; phiên này chưa khai ngôn ngữ cpp hay python.');
    }

    const source = await this.references.getAnswerSource(sessionId);
    if (!source) {
      throw new ConflictException('chưa có mã đáp án để chạy — hãy tải mã lên');
    }

    // Ca đã bị hệ thống tự bỏ (`auto_dropped_reason`) không chạy: nó không chấm được ai. Ca bị bỏ TAY không còn trong gói
    // này (bỏ tay là phiên bản mới không chép ca đó).
    let picked = bundle.cases.filter((c) => c.autoDroppedReason === null);
    if (caseKey !== null) {
      const one = bundle.cases.find((c) => c.caseKey === caseKey);
      if (!one) throw new NotFoundException(`Gói test ${bundleId} không có ca nào tên "${caseKey}".`);
      if (one.autoDroppedReason !== null) {
        throw new ConflictException(`Ca "${caseKey}" đã bị bỏ (${one.autoDroppedReason}) — không chạy được.`);
      }
      picked = [one];
    }
    if (picked.length === 0) {
      throw new ConflictException('Gói test không còn ca nào chạy được.');
    }
    if (picked.length > MAX_CASES_PER_JOB) {
      throw new BadRequestException(`Gói có ${picked.length} ca, vượt trần ${MAX_CASES_PER_JOB} ca của một lượt chạy.`);
    }

    const code = (await this.storage.getObject(source.key)).toString('utf8');
    if (createHash('sha256').update(code, 'utf8').digest('hex') !== source.sha256) {
      this.logger.error(`Mã đáp án của phiên ${sessionId}: object ${source.key} không khớp băm đã ghi`);
      throw new ConflictException('Mã đáp án trên kho không khớp băm đã ghi — hãy tải mã lên lại.');
    }

    const runId = await this.begin(sessionId, cfg?.problemId ?? null, bundleId, caseKey, source.sha256, teacherId);

    let summary: RunSummary;
    let host: Record<string, unknown> | null = null;
    try {
      const result = await sandbox.exec(
        buildExecRequest(
          language.data,
          code,
          picked.map((c) => ({ name: c.caseKey, group: c.group, input: c.input, expected: c.expectedOutput })),
        ),
      );
      summary = summarizeExec(result, picked.map((c) => c.caseKey));
      host = result.host ? { ...result.host } : null;
    } catch (error) {
      // Cổng không ném theo hợp đồng, nhưng một lỗi bất ngờ không được để dòng `running` treo.
      await this.finish(runId, 'aborted', null, []);
      this.logger.error(`Chạy thử ${runId} hỏng bất ngờ`, error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('Máy chạy bài gặp lỗi khi chạy thử — thử lại sau.');
    }

    await this.finish(runId, summary.status, host, summary.cases);
    if (summary.status === 'unavailable') {
      throw new ServiceUnavailableException('Máy chạy bài không phản hồi — thử lại sau.');
    }
    return {
      runId,
      status: summary.status,
      cases: summary.cases,
      ...(summary.compileLog !== null ? { compileLog: summary.compileLog } : {}),
    };
  }

  /** INSERT dòng `running`. Unique index từng phần làm lượt thứ hai nhận 409, kể cả khi hai request đến cùng lúc. */
  private async begin(
    sessionId: string,
    problemId: string | null,
    bundleId: string,
    caseKey: string | null,
    sourceSha256: string,
    teacherId: string,
  ): Promise<string> {
    // Dòng chết (quá hạn) được đóng trước, nếu không nó chặn phiên mãi mãi. UPDATE này được trigger cho phép
    // (running → trạng thái kết thúc, các trường khác giữ nguyên).
    await this.ds.query(
      `UPDATE examcollect.grading_test_run SET status = 'aborted', finished_at = now()
        WHERE exam_session_id = $1 AND status = 'running'
          AND requested_at < now() - make_interval(mins => $2::int)`,
      [sessionId, STALE_RUNNING_MINUTES],
    );
    try {
      const [row] = await this.ds.query(
        `INSERT INTO examcollect.grading_test_run
           (exam_session_id, problem_id, test_bundle_id, kind, case_key, source_sha256, requested_by, status)
         VALUES ($1, $2, $3, 'test_run', $4, $5, $6, 'running') RETURNING id`,
        [sessionId, problemId, bundleId, caseKey, sourceSha256, teacherId],
      );
      return row.id as string;
    } catch (error) {
      const driver = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
      if (driver?.code === '23505' && driver.constraint === ONE_RUNNING_INDEX) {
        throw new ConflictException('Phiên này đang chạy thử một lượt khác — chờ lượt đó xong rồi bấm lại.');
      }
      throw error;
    }
  }

  /** Đúng MỘT UPDATE: từ `running` sang trạng thái kết thúc (trigger `trg_grading_test_run_finish_once`). */
  private async finish(runId: string, status: RunStatus, host: Record<string, unknown> | null, cases: RunSummary['cases']): Promise<void> {
    await this.ds.query(
      `UPDATE examcollect.grading_test_run
          SET status = $2, finished_at = now(), host = $3::jsonb, cases = $4::jsonb
        WHERE id = $1 AND status = 'running'`,
      [runId, status, host === null ? null : JSON.stringify(host), JSON.stringify(cases)],
    );
  }
}
