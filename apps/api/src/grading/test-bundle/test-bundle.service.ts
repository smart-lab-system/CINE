import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CreateTestBundleDto } from './dto/create-test-bundle.dto';
import { ensureDefaultProblem, setProblemTestBundle, setSessionTestBundleAndProblem } from '../problem/resolve-problem-config';
import { assertSessionRouteAllowed } from '../problem/session-route-guard';
import { lockTeacherScoring } from '../scoring/teacher-lock';

/**
 * Một ca sẵn sàng ghi. Kiểu CẤU TRÚC, không import từ `exam-authoring`:
 * `grading` không được biết `exam-authoring` (module kia import module này,
 * không có chiều ngược lại).
 */
export interface BundleCaseInput {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
  constraintQuote?: string | null;
  /** Lý do hệ thống tự bỏ ca này. Phải đi theo ca khi chép sang phiên bản mới: mất nó là ca bị bỏ sống lại thành ca thật. */
  autoDroppedReason?: string | null;
}

/**
 * Gói test có phiên bản của MỘT phiên (§14.1). Raw SQL qua `DataSource`,
 * không repository — `grading_test_bundle`/`grading_test_case` là append-only
 * ở DB (`guard_test_bundle_approve_once`, `guard_append_only`, `guard_no_delete`),
 * và service này là nơi DUY NHẤT kiểm điều kiện TRƯỚC khi ghi: trigger của DB
 * chỉ là lưới an toàn cuối, và mã lỗi nó ném (`object_not_in_prerequisite_state`)
 * không được `PostgresExceptionFilter` map, nên chạm tới nó là một 500.
 */
@Injectable()
export class TestBundleService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(examSessionId: string, teacherId: string, dto: CreateTestBundleDto) {
    return this.ds.transaction(async (manager) => {
      await assertSessionRouteAllowed(manager, examSessionId);
      const origin = await this.originFor(manager, examSessionId, dto.derivedFromBundleId);
      const version = await this.nextVersion(manager, examSessionId);
      const problemId = await ensureDefaultProblem(manager, examSessionId);
      const [bundle] = await manager.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
         VALUES ($1, $2, $5, $3, $4) RETURNING id, version`,
        [examSessionId, version, teacherId, problemId, origin],
      );
      await this.insertCases(manager, bundle.id, dto.cases);
      return { id: bundle.id as string, version: bundle.version as number };
    });
  }

  /**
   * Origin của phiên bản mới: `teacher` khi không dẫn xuất từ đâu; ngược lại là origin của gói gốc, KHÔNG phải `teacher`. Gói
   * gốc không thuộc phiên là 404, không rò sự tồn tại của gói phiên khác.
   */
  private async originFor(manager: EntityManager, examSessionId: string, derivedFromBundleId: string | undefined): Promise<string> {
    if (derivedFromBundleId === undefined) return 'teacher';
    const [source] = await manager.query(
      `SELECT origin FROM examcollect.grading_test_bundle WHERE id = $1 AND exam_session_id = $2`,
      [derivedFromBundleId, examSessionId],
    );
    if (!source) throw new NotFoundException(`Gói gốc ${derivedFromBundleId} không thuộc phiên này.`);
    return source.origin as string;
  }

  /**
   * Gói do HỆ THỐNG sinh (G2b-R: từ đề hay từ đáp án của giảng viên), trong transaction của NGƯỜI GỌI để gói, thước và
   * dòng chạy cùng thành công hay cùng không. LUÔN chưa duyệt và chưa ghim: duyệt là hành động riêng của giảng viên,
   * qua route `approve`. Ca bị hệ thống bỏ mang `autoDroppedReason` để giảng viên thấy vì sao. Gói phải còn ít nhất một
   * ca chấm được (cùng luật với `dropCase`), nếu không thì không ghi gì.
   */
  async createGeneratedWithin(
    manager: EntityManager,
    input: { sessionId: string; teacherId: string; origin: 'generated' | 'from_model_answer'; cases: BundleCaseInput[] },
  ): Promise<{ id: string; version: number }> {
    if (!input.cases.some((c) => !c.autoDroppedReason)) {
      throw new ConflictException('Không còn ca nào chấm được sau khi lọc — không ghi gói. Một gói test phải còn ít nhất một ca.');
    }
    await assertSessionRouteAllowed(manager, input.sessionId);
    const version = await this.nextVersion(manager, input.sessionId);
    const problemId = await ensureDefaultProblem(manager, input.sessionId);
    const [bundle] = await manager.query(
      `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, version`,
      [input.sessionId, version, input.origin, input.teacherId, problemId],
    );
    await this.insertCases(manager, bundle.id, input.cases);
    return { id: bundle.id as string, version: bundle.version as number };
  }

  async approve(examSessionId: string, bundleId: string, teacherId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (bundle.approved_at) {
      throw new ConflictException(
        `Gói test ${bundleId} đã được duyệt lúc ${bundle.approved_at} — không duyệt lại được.`,
      );
    }
    return this.ds.transaction(async (m) => {
      await assertSessionRouteAllowed(m, examSessionId);
      await m.query(
        `UPDATE examcollect.grading_test_bundle SET approved_by = $1, approved_at = now() WHERE id = $2`,
        [teacherId, bundleId],
      );
      // SELECT sau UPDATE (M1, review): `UPDATE … RETURNING` qua TypeORM trả [rows, rowCount], nên `[row] = …` không ra hàng
      // và phản hồi có id và approvedAt là undefined.
      const [row] = await m.query(`SELECT id, approved_at FROM examcollect.grading_test_bundle WHERE id = $1`, [bundleId]);
      return { id: row.id as string, approvedAt: new Date(row.approved_at).toISOString() };
    });
  }

  async pin(examSessionId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (!bundle.approved_at) {
      throw new BadRequestException(
        `Gói test ${bundleId} chưa được duyệt — chỉ gói đã duyệt mới ghim được (§14.1).`,
      );
    }
    await this.ds.transaction(async (m) => {
      await assertSessionRouteAllowed(m, examSessionId);
      await setSessionTestBundleAndProblem(m, examSessionId, bundleId);
    });
    return { testBundleId: bundleId };
  }

  /**
   * Bỏ một ca khỏi gói — bằng cách tạo PHIÊN BẢN MỚI không chép ca đó.
   *
   * Không có đường nào khác: `grading_test_case` mang `guard_append_only` trên
   * UPDATE **và** DELETE, và đó là chủ ý — một `score_computation` đã ghi
   * `test_bundle_id` phải đọc lại được đúng những ca nó đã đo.
   *
   * Gói đã duyệt thì từ chối: duyệt là lúc giảng viên bảo lưng nội dung, và
   * đổi nó sau đó là đổi thước dưới chân những bài đã chấm.
   */
  async dropCase(examSessionId: string, bundleId: string, caseKey: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (bundle.approved_at) {
      throw new ConflictException(
        `Gói test ${bundleId} đã được duyệt lúc ${bundle.approved_at} — không bỏ ca được nữa. ` +
          'Hãy tạo một gói mới chỉ với những ca bạn còn giữ.',
      );
    }

    return this.ds.transaction(async (manager) => {
      await assertSessionRouteAllowed(manager, examSessionId);
      const rows: {
        case_key: string;
        group: string;
        input: string;
        expected_output: string;
        constraint_quote: string | null;
        auto_dropped_reason: string | null;
      }[] =
        await manager.query(
          `SELECT case_key, "group", input, expected_output, constraint_quote, auto_dropped_reason
             FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
          [bundleId],
        );
      const kept = rows.filter((r) => r.case_key !== caseKey);
      if (kept.length === rows.length) {
        // "Không có ca đó" khác "bỏ được rồi": giảng viên cần biết là cái nào.
        throw new NotFoundException(`Gói test ${bundleId} không có ca nào tên "${caseKey}".`);
      }
      // `create` đòi ≥ 1 ca (`ArrayMinSize(1)`); bỏ ca cuối ra gói rỗng mà `approve`/`pin` không kiểm. Ca hệ thống đã tự bỏ
      // không chấm được ai nên không tính là "còn ca".
      if (!kept.some((r) => r.auto_dropped_reason === null)) {
        throw new ConflictException(
          `Không bỏ được ca "${caseKey}": đó là ca cuối cùng còn chấm được của gói. Một gói test phải còn ít nhất một ca — ` +
            'nếu không muốn dùng gói này thì tạo gói khác.',
        );
      }

      const version = await this.nextVersion(manager, examSessionId);
      const problemId = await ensureDefaultProblem(manager, examSessionId);
      const [next] = await manager.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, problem_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, version`,
        [examSessionId, version, bundle.origin, bundle.created_by, problemId],
      );
      await this.insertCases(
        manager,
        next.id,
        kept.map((r) => ({
          caseKey: r.case_key,
          group: r.group,
          input: r.input,
          expectedOutput: r.expected_output,
          constraintQuote: r.constraint_quote,
          autoDroppedReason: r.auto_dropped_reason,
        })),
      );
      return { id: next.id as string, version: next.version as number };
    });
  }

  async list(examSessionId: string) {
    const rows: { id: string; version: number; approved_at: string | null; origin: string; case_count: number }[] =
      await this.ds.query(
        `SELECT b.id, b.version, b.approved_at, b.origin, COUNT(c.id)::int AS case_count
           FROM examcollect.grading_test_bundle b
           LEFT JOIN examcollect.grading_test_case c ON c.bundle_id = b.id AND c.auto_dropped_reason IS NULL
          WHERE b.exam_session_id = $1
          GROUP BY b.id, b.version, b.approved_at, b.origin ORDER BY b.version DESC`,
        [examSessionId],
      );
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      approvedAt: r.approved_at,
      origin: r.origin,
      caseCount: r.case_count,
    }));
  }

  async get(examSessionId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    const rows: {
      case_key: string;
      group: string;
      input: string;
      expected_output: string;
      constraint_quote: string | null;
      auto_dropped_reason: string | null;
    }[] =
      await this.ds.query(
        `SELECT case_key, "group", input, expected_output, constraint_quote, auto_dropped_reason
           FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
        [bundleId],
      );
    return {
      id: bundle.id,
      version: bundle.version,
      approvedAt: bundle.approved_at,
      cases: rows.map((r) => ({
        caseKey: r.case_key,
        group: r.group,
        input: r.input,
        expectedOutput: r.expected_output,
        constraintQuote: r.constraint_quote,
        autoDroppedReason: r.auto_dropped_reason,
      })),
    };
  }

  /**
   * Số phiên bản kế tiếp, đọc BÊN TRONG transaction cùng lúc với `INSERT`:
   * `uq_grading_test_bundle_version` là UNIQUE nên hai lần tạo song song
   * (bấm hai lần) sẽ đụng nhau nếu đọc `MAX(version)` bên ngoài.
   */
  private async nextVersion(manager: EntityManager, examSessionId: string): Promise<number> {
    const [{ next_version }] = await manager.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`,
      [examSessionId],
    );
    return next_version as number;
  }

  /** `constraint_quote` vắng khi tạo tay và khi nhận từ Soạn đề (đề sinh không kèm trích dẫn). */
  private async insertCases(manager: EntityManager, bundleId: string, cases: BundleCaseInput[]): Promise<void> {
    for (const c of cases) {
      await manager.query(
        `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, constraint_quote, auto_dropped_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bundleId, c.caseKey, c.group, c.input, c.expectedOutput, c.constraintQuote ?? null, c.autoDroppedReason ?? null],
      );
    }
  }

  /** Gói phải thuộc ĐÚNG phiên được truyền vào (Review Focus #3). */
  private async findOwnedBundle(examSessionId: string, bundleId: string) {
    const [bundle] = await this.ds.query(
      `SELECT id, version, origin, created_by, approved_at FROM examcollect.grading_test_bundle
        WHERE id = $1 AND exam_session_id = $2`,
      [bundleId, examSessionId],
    );
    if (!bundle) {
      throw new NotFoundException(`Gói test ${bundleId} không thuộc phiên ${examSessionId}`);
    }
    return bundle;
  }
}
