import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { extractText } from '../grading/extract-text';
import { ANSWER_SOURCE_MAX_BYTES, AnswerSource, GradingReferenceService } from '../grading/grading-reference.service';
import { SandboxPort } from '../grading/investigator/tools';
import { costOf } from '../grading/investigator/pricing';
import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../grading/pipeline/investigator-deps';
import { ensureDefaultProblem, resolveProblemConfig } from '../grading/problem/resolve-problem-config';
import { assertSessionRouteAllowed } from '../grading/problem/session-route-guard';
import { TestRunStatus } from '../grading/entities/grading-test-run.entity';
import { buildExecRequest, MAX_CASES_PER_JOB, RunnableCase } from '../grading/test-bundle/run-source';
import { BundleCaseInput, TestBundleService } from '../grading/test-bundle/test-bundle.service';
import { busyMessage, FinishRun, TestRunStore } from '../grading/test-bundle/test-run.store';
import { ExecResult, SandboxLanguage, sandboxLanguage } from '../sandbox/contract';
import { StorageService } from '../storage/storage.service';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { GenerateQuotaService } from './generate-quota.service';
import { AuthoringUsage } from './ai-provider/exam-authoring-provider';
import { checkExamples, coverageWarnings, interpretRuns, KeptCase, prefilterCases, quoteAppearsInStatement, RulerProposal } from './ruler/ruler-core';
import { RULER_PROMPT_VERSION, RulerMode } from './ruler/ruler-prompt';
import { RULER_PROVIDER, RulerProvider, RulerProviderFailure } from './ruler/ruler-provider';

/** Job nhỏ để biết worker còn sống TRƯỚC khi tốn một lời gọi model. */
const PREFLIGHT_BUDGET_MS = 10_000;
const PREFLIGHT_CASE = 'preflight';
const PREFLIGHT_CODE: Record<SandboxLanguage, string> = { cpp: 'int main() { return 0; }\n', python: 'pass\n' };
/**
 * Tên ca của ví dụ trong job. Có dấu chấm, mà khoá ca của gói không bao giờ có (`uniqueKey` chỉ giữ `[a-z0-9_-]`), nên
 * ví dụ không thể đụng tên một ca của model.
 */
const EXAMPLE_PREFIX = 'ex.';
const MAX_MISMATCHES_SHOWN = 5;
const SNIPPET_CHARS = 200;
const COMPILE_LOG_CHARS = 1_024;

export interface RulerGenerateResult {
  testBundle: { id: string; version: number; caseCount: number; droppedCount: number };
  /** Chỉ có khi sinh từ đề: đáp án mẫu do hệ thống viết nên có độ tin cậy cần báo. */
  ruler?: { trust: 'verified' | 'unverified'; examplesChecked: number };
  run: { runId: string; status: 'pass' };
  warnings: string[];
}

interface Plan {
  problemId: string;
  language: SandboxLanguage;
  statement: string;
  /** Có ở chế độ `answer`: mã của giảng viên đã đọc từ kho và đối chiếu băm. */
  teacher: (AnswerSource & { code: string }) | null;
}

const clip = (text: string) => (text.length > SNIPPET_CHARS ? `${text.slice(0, SNIPPET_CHARS)}…` : text);

/**
 * Sinh gói test cho MỘT câu (G2b-R Task 3), theo hai đường:
 * - `statement`: model viết đáp án mẫu và đề xuất ca từ đề; đáp án do hệ thống sinh, độ tin cậy do bước kiểm ví dụ quyết;
 * - `answer`: model chỉ đề xuất ca từ đề, output lấy từ chạy mã đáp án của giảng viên.
 *
 * Bất biến (spec §3): output mong đợi CHỈ là stdout của sandbox; không đường nào duyệt hay ghim gói; mọi cổng kiểm chặn
 * TRƯỚC khi gọi model; không chạy được hay lệch ví dụ thì KHÔNG ghi gói hay đáp án nào. Lệnh sandbox nằm NGOÀI transaction
 * (một job có thể chạy 60 giây, không giữ khoá giảng viên suốt thời gian đó); ghi gói, đáp án và đóng dòng chạy là một transaction.
 */
@Injectable()
export class RulerGenerateService {
  private readonly logger = new Logger(RulerGenerateService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AiUsageEntity) private readonly usage: Repository<AiUsageEntity>,
    @Inject(INVESTIGATOR_DEPS) private readonly deps: InvestigatorDeps,
    @Inject(RULER_PROVIDER) private readonly provider: RulerProvider,
    private readonly references: GradingReferenceService,
    private readonly bundles: TestBundleService,
    private readonly store: TestRunStore,
    private readonly storage: StorageService,
    private readonly quota: GenerateQuotaService,
  ) {}

  async generate(session: ExamSessionEntity, teacherId: string, mode: RulerMode): Promise<RulerGenerateResult> {
    const plan = await this.precheck(session, mode);
    const sandbox = await this.liveSandbox(plan.language);
    await this.quota.assertWithin(teacherId);

    const runId = await this.store.begin({
      sessionId: session.id,
      problemId: plan.problemId,
      bundleId: null,
      kind: mode === 'statement' ? 'generate_statement' : 'generate_answer',
      caseKey: null,
      sourceSha256: plan.teacher?.sha256 ?? null,
      teacherId,
    });
    try {
      return await this.produce(session, teacherId, mode, plan, sandbox, runId);
    } catch (error) {
      // Dòng `running` không bao giờ được treo: lỗi bất ngờ, hay transaction hoàn tác, đều để dòng ở `running`. Đã đóng
      // rồi thì UPDATE này không đổi gì (`WHERE status = 'running'`).
      await this.store.finish(runId, 'aborted').catch((e: unknown) => this.logger.error(`không đóng được dòng chạy ${runId}: ${String(e)}`));
      throw error;
    }
  }

  /** Mọi kiểm tra không tốn tiền, theo thứ tự rẻ → đắt. Không gì ở đây gọi model hay chạy sandbox. */
  private async precheck(session: ExamSessionEntity, mode: RulerMode): Promise<Plan> {
    await this.references.assertNotGradedYet(session);
    // Giao dịch ngắn: cổng route (phiên nhiều câu, đề cương đã xác nhận → 409) và tạo câu mặc định nếu chưa có.
    const problemId = await this.ds.transaction(async (m) => {
      await assertSessionRouteAllowed(m, session.id);
      return ensureDefaultProblem(m, session.id);
    });

    const cfg = await resolveProblemConfig(this.ds.manager, session.id);
    const language = sandboxLanguage.safeParse(cfg?.language);
    if (!language.success) {
      throw new BadRequestException('Sinh gói test chỉ hỗ trợ bài C++ hoặc Python; câu này chưa khai ngôn ngữ cpp hay python.');
    }

    if (await this.store.hasLiveRun(session.id)) {
      throw new ConflictException(busyMessage(mode === 'statement' ? 'generate_statement' : 'generate_answer'));
    }

    let teacher: Plan['teacher'] = null;
    if (mode === 'statement') {
      if ((await this.references.answerState(session.id)).teacherOwned) {
        throw new ConflictException(
          'Phiên đã có đáp án mẫu của giảng viên — không ghi đè. Dùng "Sinh gói test từ đáp án của bạn" để sinh gói từ chính đáp án đó.',
        );
      }
    } else {
      teacher = await this.readTeacherSource(session.id);
    }

    const loaded = await this.references.loadForGrading(session.id);
    if (!loaded.questionPdf) {
      throw new ConflictException('Phiên chưa có đề bài (hoặc không đọc được file đề) — hãy chọn đề bài trước khi sinh gói test.');
    }
    const statement = (await extractText(loaded.questionPdf, loaded.questionFilename ?? '')).trim();
    if (!statement) {
      const name = loaded.questionFilename ? ` (${loaded.questionFilename})` : '';
      throw new UnprocessableEntityException(`Đề bài chưa đọc được thành chữ${name} — cần đề dạng DOCX hoặc TXT.`);
    }

    return { problemId, language: language.data, statement, teacher };
  }

  /** Mã đáp án của giảng viên: đọc từ kho bằng khoá theo băm rồi đối chiếu băm, cùng luật với chạy thử. */
  private async readTeacherSource(sessionId: string): Promise<AnswerSource & { code: string }> {
    const source = await this.references.getAnswerSource(sessionId);
    if (!source) throw new ConflictException('Chưa có mã đáp án để sinh gói test — hãy tải mã đáp án lên trước.');
    const code = (await this.storage.getObject(source.key)).toString('utf8');
    if (createHash('sha256').update(code, 'utf8').digest('hex') !== source.sha256) {
      this.logger.error(`Mã đáp án của phiên ${sessionId}: object ${source.key} không khớp băm đã ghi`);
      throw new ConflictException('Mã đáp án trên kho không khớp băm đã ghi — hãy tải mã lên lại.');
    }
    return { ...source, code };
  }

  /** Worker còn trả lời không? Dừng bằng 503 TRƯỚC khi tốn một lời gọi model. */
  private async liveSandbox(language: SandboxLanguage): Promise<SandboxPort> {
    const sandbox = this.deps.sandbox;
    if (!sandbox) {
      throw new ServiceUnavailableException('Máy chạy bài chưa được cấu hình trên máy chủ này — chưa sinh được gói test.');
    }
    let result: ExecResult;
    try {
      result = await sandbox.exec(
        buildExecRequest(language, PREFLIGHT_CODE[language], [{ name: PREFLIGHT_CASE, group: null, input: '', expected: null }], PREFLIGHT_BUDGET_MS),
      );
    } catch (error) {
      this.logger.warn(`preflight sandbox ném lỗi: ${String(error)}`);
      throw new ServiceUnavailableException('Máy chạy bài không phản hồi — thử lại sau.');
    }
    if (result.unavailable !== null || (result.compile && !result.compile.ok)) {
      throw new ServiceUnavailableException('Máy chạy bài không phản hồi — thử lại sau.');
    }
    return sandbox;
  }

  private async produce(
    session: ExamSessionEntity,
    teacherId: string,
    mode: RulerMode,
    plan: Plan,
    sandbox: SandboxPort,
    runId: string,
  ): Promise<RulerGenerateResult> {
    // 1. Model đề xuất. Token đã tiêu thì ghi TRƯỚC mọi việc khác: lượt hỏng sau đó vẫn tốn tiền thật.
    let proposal: RulerProposal;
    let usage: NonNullable<FinishRun['usage']>;
    try {
      const outcome = await this.provider.propose({
        statement: plan.statement,
        language: plan.language,
        ...(plan.teacher ? { teacherAnswer: plan.teacher.code } : {}),
      });
      proposal = outcome.proposal;
      usage = this.usageOf(outcome.usage, outcome.promptVersion);
      await this.recordUsage(teacherId, outcome.usage, usage.costUsd);
    } catch (error) {
      if (error instanceof RulerProviderFailure) {
        if (error.usage) {
          // Lượt hỏng không có `promptVersion` từ provider, nhưng khuôn prompt đã dùng là khuôn hiện hành.
          const failed = this.usageOf(error.usage, RULER_PROMPT_VERSION);
          await this.recordUsage(teacherId, error.usage, failed.costUsd);
          await this.store.finish(runId, 'aborted', { usage: failed });
        }
        throw error.httpError;
      }
      throw error;
    }

    const close = (status: TestRunStatus, extra: FinishRun = {}, manager?: EntityManager) =>
      this.store.finish(runId, status, { usage, ...extra }, manager);
    const stop = async (status: TestRunStatus, error: HttpException, extra: FinishRun = {}): Promise<never> => {
      await close(status, extra);
      throw error;
    };

    // 2. Mã chạy: của model (chế độ đề) hay của giảng viên.
    const code = plan.teacher ? plan.teacher.code : proposal.modelAnswer;
    if (code === null || code.trim() === '') {
      return stop('fail', new UnprocessableEntityException('Model không trả mã đáp án — thử lại hoặc tự tạo gói test.'));
    }
    if (Buffer.byteLength(code, 'utf8') > ANSWER_SOURCE_MAX_BYTES) {
      return stop('fail', new UnprocessableEntityException('Mã đáp án model viết quá lớn — thử lại hoặc tự tạo gói test.'));
    }

    // 3. Lọc TRƯỚC khi chạy. Ví dụ chạy chung job với ca nên chiếm chỗ trong trần 200.
    const runnableExamples = proposal.examples
      .map((example, index) => ({ example, index }))
      .filter(({ example }) => quoteAppearsInStatement(example.quote, plan.statement));
    const { kept, dropped } = prefilterCases(proposal.cases, plan.statement, MAX_CASES_PER_JOB - runnableExamples.length);
    if (kept.length === 0) {
      return stop('dropped_all', new ConflictException(this.droppedAllMessage(proposal.cases.length, dropped.map((d) => `${d.name}: ${d.reason}`))));
    }

    // 4. Chạy đáp án hai lần: output ổn định hay bỏ ca (D-C).
    const jobCases: RunnableCase[] = [
      ...kept.map((k) => ({ name: k.key, group: k.group, input: k.input, expected: null })),
      ...runnableExamples.map(({ example, index }) => ({ name: `${EXAMPLE_PREFIX}${index}`, group: null, input: example.input, expected: null })),
    ];
    const request = buildExecRequest(plan.language, code, jobCases);
    const first = await this.execOrStop(sandbox, request, stop);
    const second = await this.execOrStop(sandbox, request, stop);
    const runCases = first.cases.map((c) => ({ name: c.name, status: c.status, ms: c.ms, diff: null }));
    const host = first.host ? { ...first.host } : null;

    const { stable, dropped: unstable } = interpretRuns(first, second, jobCases.map((c) => c.name));

    // 5. Ví dụ trong đề: đáp án chạy thật phải tái tạo đúng chúng. Lệch → không ghi gì; hệ thống không kết luận đáp án sai.
    const examples = checkExamples(proposal.examples, plan.statement, (index) => stable.get(`${EXAMPLE_PREFIX}${index}`) ?? null);
    if (examples.mismatches.length > 0) {
      return stop(
        'fail',
        new UnprocessableEntityException({
          message:
            'Đáp án chạy thật không tái tạo đúng ví dụ trong đề. Hệ thống không kết luận đáp án sai (ví dụ trong đề có thể sai chính tả) — hãy xem và quyết định.',
          mismatches: examples.mismatches.slice(0, MAX_MISMATCHES_SHOWN).map((m) => ({
            input: clip(m.input),
            expected: clip(m.expected),
            actual: clip(m.actual),
          })),
        }),
        { host, cases: runCases },
      );
    }

    // 6. Dựng ca của gói: ca ổn định, ca bị bỏ trước khi chạy, ca bị bỏ vì không ổn định — hai loại sau vẫn nằm trong gói
    // kèm lý do, để giảng viên thấy hệ thống đã bỏ gì.
    const unstableReason = new Map(unstable.map((d) => [d.name, d.reason]));
    const stableKept = kept.filter((k) => stable.has(k.key));
    const unstableKept = kept.filter((k) => !stable.has(k.key));
    if (stableKept.length === 0) {
      const reasons = [...dropped.map((d) => `${d.name}: ${d.reason}`), ...unstableKept.map((k) => `${k.key}: ${unstableReason.get(k.key) ?? 'không chạy ổn định'}`)];
      return stop('dropped_all', new ConflictException(this.droppedAllMessage(proposal.cases.length, reasons)), { host, cases: runCases });
    }
    const bundleCases: BundleCaseInput[] = [
      ...stableKept.map((k) => ({ caseKey: k.key, group: k.group, input: k.input, expectedOutput: stable.get(k.key) as string, constraintQuote: k.quote })),
      ...unstableKept.map((k) => this.droppedCase(k, unstableReason.get(k.key) ?? 'không chạy ổn định')),
      ...dropped.map((d) => ({ caseKey: d.key, group: d.group, input: d.input, expectedOutput: '', constraintQuote: null, autoDroppedReason: d.reason })),
    ];
    const warnings = coverageWarnings(
      proposal.cases.length,
      stableKept,
      [...dropped.map((d) => ({ name: d.name, reason: d.reason })), ...unstableKept.map((k) => ({ name: k.key, reason: unstableReason.get(k.key) ?? 'không chạy ổn định' }))],
    );

    // 7. Ghi. Mã của model lên kho TRƯỚC transaction (như đường gắn đề): lỗi DB để lại object mồ côi, chấp nhận.
    const trust: 'verified' | 'unverified' = examples.checked > 0 ? 'verified' : 'unverified';
    const source: AnswerSource = plan.teacher
      ? { key: plan.teacher.key, sha256: plan.teacher.sha256 }
      : await this.putGeneratedSource(session.id, plan.language, code);
    const bundle = await this.ds.transaction(async (m) => {
      const created = await this.bundles.createGeneratedWithin(m, {
        sessionId: session.id,
        teacherId,
        origin: mode === 'statement' ? 'generated' : 'from_model_answer',
        cases: bundleCases,
      });
      // Đáp án của giảng viên KHÔNG đổi (nguồn gốc, mã, độ tin cậy): chỉ đường đề mới ghi `grading_reference`.
      if (mode === 'statement') await this.references.writeGeneratedSource(m, session, teacherId, source, trust);
      await close('pass', { host, cases: runCases, testBundleId: created.id, sourceSha256: source.sha256 }, m);
      return created;
    });

    return {
      testBundle: { id: bundle.id, version: bundle.version, caseCount: stableKept.length, droppedCount: bundleCases.length - stableKept.length },
      ...(mode === 'statement' ? { ruler: { trust, examplesChecked: examples.checked } } : {}),
      run: { runId, status: 'pass' },
      warnings,
    };
  }

  /**
   * Một lượt chạy đáp án. Không dùng được thì đóng dòng chạy bằng đúng kết cục và dừng: worker mất → 503, hết ngân sách →
   * 503, không biên dịch → 422 kèm log. Không bao giờ ghi một output rỗng thay cho "không chạy được".
   */
  private async execOrStop(
    sandbox: SandboxPort,
    request: ReturnType<typeof buildExecRequest>,
    stop: (status: TestRunStatus, error: HttpException, extra?: FinishRun) => Promise<never>,
  ): Promise<ExecResult> {
    let result: ExecResult;
    try {
      result = await sandbox.exec(request);
    } catch (error) {
      this.logger.error(`lượt chạy đáp án hỏng bất ngờ: ${String(error)}`);
      return stop('aborted', new ServiceUnavailableException('Máy chạy bài gặp lỗi khi chạy đáp án — thử lại sau.'));
    }
    if (result.unavailable !== null) {
      return stop('unavailable', new ServiceUnavailableException('Máy chạy bài không phản hồi — thử lại sau.'), { host: result.host ? { ...result.host } : null });
    }
    if (result.compile && !result.compile.ok) {
      return stop(
        'compile_error',
        new UnprocessableEntityException({ message: 'Đáp án không biên dịch được — không ghi gói test.', compileLog: result.compile.log.slice(0, COMPILE_LOG_CHARS) }),
        { host: result.host ? { ...result.host } : null },
      );
    }
    if (result.aborted !== null) {
      return stop('aborted', new ServiceUnavailableException('Chạy đáp án hết ngân sách thời gian — không ghi gói test; thử lại hoặc giảm số ca.'), {
        host: result.host ? { ...result.host } : null,
      });
    }
    return result;
  }

  private droppedCase(k: KeptCase, reason: string): BundleCaseInput {
    return { caseKey: k.key, group: k.group, input: k.input, expectedOutput: '', constraintQuote: k.quote, autoDroppedReason: reason };
  }

  private droppedAllMessage(proposed: number, reasons: string[]): string {
    return `Không còn ca nào chấm được sau khi lọc (${proposed} ca đề xuất${reasons.length ? ` — ${reasons.join('; ')}` : ''}). Không ghi gói test; hãy tự tạo gói bằng route tạo gói test.`;
  }

  private async putGeneratedSource(sessionId: string, language: SandboxLanguage, code: string): Promise<AnswerSource> {
    const sha256 = createHash('sha256').update(code, 'utf8').digest('hex');
    const key = `grading-reference/${sessionId}/source-${sha256}.${language === 'python' ? 'py' : 'cpp'}`;
    await this.storage.putObject(key, Buffer.from(code, 'utf8'), 'text/plain; charset=utf-8');
    return { key, sha256 };
  }

  /** Chi phí theo đúng cách của đường chấm (`costOf` + `priceOf`): `null` khi chưa khai giá model, KHÔNG phải 0. */
  private usageOf(u: AuthoringUsage, promptVersion: string): NonNullable<FinishRun['usage']> {
    const costUsd = costOf({ [u.modelUsed]: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } }, (model) => this.deps.priceOf?.(model));
    return { promptVersion, modelUsed: u.modelUsed, tokensIn: u.inputTokens, tokensOut: u.outputTokens, costUsd };
  }

  /**
   * Dấu vết vận hành, NUỐT lỗi ghi (cùng luật với soạn đề): giảng viên đã có kết quả trong tay, không làm hỏng lượt vì không
   * ghi được một dòng thống kê — nhưng phải kêu trong log. `verification_status` là `unchecked`: lúc gọi model chưa có bước
   * kiểm nào; kết cục thật của lượt nằm ở `grading_test_run.status`.
   */
  private async recordUsage(teacherId: string, u: AuthoringUsage, costUsd: number | null): Promise<void> {
    try {
      await this.usage.save(
        this.usage.create({
          teacherId,
          feature: 'ruler_generate',
          modelUsed: u.modelUsed,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          costUsd: costUsd === null ? null : String(costUsd),
          questionCount: 0,
          verificationStatus: 'unchecked',
        }),
      );
    } catch (error) {
      this.logger.error(`không ghi được ai_usage cho giảng viên ${teacherId}: ${String(error)}`);
    }
  }
}
