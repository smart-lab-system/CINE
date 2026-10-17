import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ExamSessionService } from "../exam-session/exam-session.service";
import { ExamMaterialService } from "../exam-session/exam-material.service";
import {
  ExamSessionEntity,
  ExamSessionStatus,
} from "../exam-session/entities/exam-session.entity";
import { GradingReferenceService } from "../grading/grading-reference.service";
import { TestBundleService } from "../grading/test-bundle/test-bundle.service";
import { ensureDefaultProblem } from "../grading/problem/resolve-problem-config";
import {
  AuthoredQuestion,
  authoringContextOf,
  createProblemsFromAuthoring,
  planAuthoredProblems,
} from "../grading/problem/problem.service";
import { StorageService } from "../storage/storage.service";
import { buildExamPaperDocx } from "./docx/exam-paper.docx";
import { buildAnswerKeyDocx } from "./docx/answer-key.docx";
import { AuthoringCase, flattenAuthoringCases } from "./authoring-bundle";
import { parseExamJson } from "./dto/parse-exam";

export const PAPER_FILENAME = "de-thi.docx";
export const ANSWER_KEY_FILENAME = "dap-an-va-test.docx";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Trạng thái đã đóng: không còn gì để gắn vào.
 *
 * `cancelled` nằm đây chứ không rơi vào phép so giờ bên dưới, vì một phiên
 * huỷ vẫn có thể có `start_time` ở tương lai.
 */
const CLOSED: ReadonlySet<ExamSessionStatus> = new Set<ExamSessionStatus>([
  "collecting",
  "completed",
  "cancelled",
]);

/**
 * Phiên nào gắn đề được — và vì sao luật này đo THỜI GIAN chứ không đọc
 * `status`.
 *
 * Ranh giới rò rỉ thật nằm ở `start_time`: `ExamMaterialService.listForAgent`
 * phát tài liệu cho agent ngay khi `now >= start_time` và không phát gì trước
 * đó (Security rule 2). Thả một bộ đề vào phiên đã qua mốc ấy nghĩa là nửa
 * phòng làm đề A, nửa kia làm A+B.
 *
 * Bản đầu của hàm này viết `status ∈ {draft, scheduled}` — nghe hợp lý, và
 * SAI TOÀN TẬP: `ExamSessionService.create()` ghi thẳng `'active'` cho mọi
 * phiên mới (bản demo không có bước "phát hành" riêng, và `agent:join` từ
 * chối phiên chưa `active`). Không dòng nào trong hệ thống từng mang trạng
 * thái `draft` hay `scheduled` — đo trên DB dev: 17.942 phiên, 0 dòng ở hai
 * trạng thái đó. Luật dựng trên chúng sẽ từ chối 100% lượt gắn đề, và tính
 * năng chết lặng chứ không báo lỗi. Chính `exam-session.entity.ts` đã ghi
 * chú điều này từ trước; luật ở đây đọc nó thay vì đoán.
 */
export function canAttachExam(
  session: Pick<ExamSessionEntity, "status" | "startTime">,
  now: Date,
): boolean {
  if (CLOSED.has(session.status)) {
    return false;
  }
  return now.getTime() < session.startTime.getTime();
}

export interface AttachResult {
  examMaterialId: string;
  paperFilename: string;
  answerKeyFilename: string;
  /**
   * Gói test lấy từ chính đề vừa soạn; `null` khi đề không sinh ca nào.
   * `grading-run.service.ts` chặn bắt đầu chấm khi phiên có bài code mà chưa
   * ghim gói test — nên đây là điều kiện để phiên đó chấm được, không phải
   * tiện lợi.
   */
  testBundle: {
    id: string;
    version: number;
    approvedAt: string | null;
    pinned: boolean;
  } | null;
}

/**
 * Gắn đề vừa soạn vào một phiên thi — MỘT lời gọi, làm trọn ở server.
 *
 * ## Vì sao không để frontend xâu chuỗi như cũ
 *
 * Bản đầu làm đúng việc này bằng bốn lượt gọi từ trình duyệt: xuất đề → tạo
 * material → xin URL đáp án → PUT đáp án → ghi grading reference. Hai chỗ
 * hỏng, và cả hai đều không sửa được ở phía frontend:
 *
 * 1. **Luật "phiên nào gắn được" chỉ sống trong một cái radio bị disabled.**
 *    Ba endpoint kia đều là endpoint dùng chung, không cái nào đọc
 *    `session.status`, và chúng KHÔNG NÊN đọc: thêm tài liệu giữa giờ là
 *    tính năng có thật, có test giữ (`exam-material.e2e-spec.ts` —
 *    "notifies an already-joined agent when the teacher adds a material
 *    afterward"), vì một bản đính chính giữa giờ là chuyện bình thường.
 *    Server không phân biệt được "đính chính" với "thay nguyên bộ đề" khi cả
 *    hai đi chung một cửa. Cho luồng soạn đề CỬA RIÊNG là cách duy nhất đặt
 *    được cái khoá mà không giết tính năng kia.
 *
 * 2. **Hỏng giữa chừng để lại rác.** PUT xong hai file rồi lượt ghi cuối
 *    hỏng là có một `exam_material` mồ côi nằm lại, giảng viên phải tự dọn.
 *    Ở đây bước cuối hỏng thì bước trước được gỡ (xem `catch` bên dưới).
 */
@Injectable()
export class AttachExamService {
  private readonly logger = new Logger(AttachExamService.name);

  constructor(
    private readonly sessions: ExamSessionService,
    private readonly materials: ExamMaterialService,
    private readonly references: GradingReferenceService,
    private readonly storage: StorageService,
    private readonly bundles: TestBundleService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async attach(
    teacherId: string,
    examSessionId: string,
    examJson: string,
  ): Promise<AttachResult> {
    // Hình dạng trước, phiên sau: một `examJson` hỏng không đáng để chạm vào
    // cơ sở dữ liệu.
    const exam = parseExamJson(examJson);

    // 404 khi phiên không tồn tại, 403 khi nó thuộc giảng viên khác —
    // quy ước của `findOwnedBy`, dùng chung với mọi route phiên thi khác.
    const session = await this.sessions.findEntityForOwner(
      examSessionId,
      teacherId,
    );

    if (!canAttachExam(session, new Date())) {
      throw new ConflictException(
        "Không gắn đề được vào phiên này: phiên đã bắt đầu, đã kết thúc hoặc đã huỷ. " +
          "Đề chỉ gắn được trước giờ thi — qua giờ thi thì agent đã nhận tài liệu, " +
          "và gắn thêm sẽ khiến mỗi em nhận một bộ khác nhau.",
      );
    }

    // Đề nhiều câu bị kiểm D1 (điểm = tổng rubric) và D2 (ngôn ngữ) TRƯỚC mọi lệnh ghi, để đề sai thì không để lại gì.
    // Đề một câu giữ đường cũ: điểm lấy từ rubric như trước.
    const authoring =
      exam.questions.length > 1
        ? await authoringContextOf(this.ds.manager, session.id)
        : null;
    if (authoring) {
      planAuthoredProblems(exam.questions, authoring);
    }

    const [paper, answerKey] = await Promise.all([
      buildExamPaperDocx(exam),
      buildAnswerKeyDocx(exam),
    ]);

    // Đáp án ĐI TRƯỚC, và nằm ở khoá cố định của phiên (prefix
    // `grading-reference/`, không bao giờ lọt vào `listForAgent`). Hỏi
    // `requestAnswerKeyUpload` để lấy khoá thay vì tự ghép chuỗi: cách ghép
    // khoá đó là cơ chế giữ đáp án khỏi tay sinh viên, và nó phải có đúng
    // một chỗ định nghĩa. URL ký kèm theo thì bỏ — bytes đã nằm trong bộ nhớ
    // tiến trình này rồi (xem `StorageService.putObject`).
    const { storageKey: answerKeyKey } =
      await this.references.requestAnswerKeyUpload(session);

    const examMaterialId = randomUUID();
    const paperKey = this.storage.buildMaterialKey(session.id, examMaterialId);

    // Chặng đã qua quyết định cách dọn khi hỏng — xem `catch`.
    let createdMaterialId: string | null = null;
    let referenceWritten = false;
    try {
      // Cả `materials.create` lẫn `references.upsert` đều HEAD-check storage,
      // nên phải có byte thật TRƯỚC khi gọi bất kỳ cái nào. Trước đây không
      // có lệnh ghi nào ở đây: mọi lượt gắn đề dừng ở 400 "Chưa thấy file
      // trên kho lưu trữ".
      await Promise.all([
        this.storage.putObject(paperKey, paper, DOCX_MIME),
        this.storage.putObject(answerKeyKey, answerKey, DOCX_MIME),
      ]);

      const material = await this.materials.create(session, {
        examMaterialId,
        storageKey: paperKey,
        fileName: PAPER_FILENAME,
        fileSize: paper.length,
      });
      createdMaterialId = material.id;

      await this.references.upsert(
        session,
        {
          questionMaterialId: material.id,
          modelAnswerStorageKey: answerKeyKey,
          modelAnswerFilename: ANSWER_KEY_FILENAME,
          // Đề do model sinh mà chưa chạy thử thì mang dấu — xem
          // `grading-reference.entity.ts`.
          modelAnswerUnverified: exam.verification.status !== "passed",
        },
        teacherId,
        "authoring",
      );
      referenceWritten = true;

      // Gói test là bước CUỐI, có chủ ý: đặt trước `upsert` thì một lần gắn
      // hỏng ở `upsert` vẫn để lại gói đã GHIM — phiên bị đóng dấu bằng thước
      // của một lượt gắn thất bại, tệ hơn một đề thiếu thước.
      const authoredCases = flattenAuthoringCases(exam.questions);
      const testBundle = authoring
        ? await this.attachProblems(session.id, teacherId, exam.questions, authoredCases)
        : authoredCases.length > 0
          ? await this.bundles.adoptFromAuthoring(
              session.id,
              teacherId,
              authoredCases,
              session.testBundleId !== null,
              await ensureDefaultProblem(this.ds.manager, session.id),
            )
          : null;

      return {
        examMaterialId: material.id,
        paperFilename: PAPER_FILENAME,
        answerKeyFilename: ANSWER_KEY_FILENAME,
        testBundle,
      };
    } catch (error) {
      if (referenceWritten) {
        // Đề và đáp án đã ghi hợp lệ, và `grading_reference` đang giữ
        // material bằng FK RESTRICT nên `materials.remove` sẽ từ chối. Chỉ
        // gói test thiếu — nói thẳng thay vì dọn dở.
        this.logger.error(
          `Gắn đề vào phiên ${session.id}: đề và đáp án đã ghi nhưng gói test hỏng — phiên chưa có thước từ đề này`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
      // KHÔNG BAO GIỜ đụng object đáp án: khoá của nó là khoá CỐ ĐỊNH của
      // phiên, nên xoá nó là xoá luôn đáp án của lần gắn trước.
      //
      // - Đã có dòng `exam_material`: `materials.remove` xoá CẢ dòng lẫn object.
      //   Chỉ `deleteObject` thì để lại một dòng trỏ vào object đã xoá, và
      //   `listForAgent` sẽ phát URL chết cho sinh viên.
      // - Chưa có dòng nào: chỉ có object đề vừa ghi, xoá đúng nó.
      const cleanup: Promise<void> =
        createdMaterialId !== null
          ? this.materials.remove(session, createdMaterialId)
          : this.storage.deleteObject(paperKey);
      await cleanup.catch((cleanupError: unknown) => {
        this.logger.error(
          `Gắn đề hỏng và dọn ${createdMaterialId ?? paperKey} cũng hỏng — còn lại một mục mồ côi`,
          cleanupError instanceof Error
            ? cleanupError.stack
            : String(cleanupError),
        );
      });
      throw error;
    }
  }

  /**
   * Đề nhiều câu: tạo câu và ghim gói của từng câu trong MỘT transaction, nên hỏng ở đâu thì không câu nào còn
   * dở dang. Trả gói của câu 1 để giữ hình dạng `AttachResult.testBundle`; câu 1 là bí danh của phiên (§3.3).
   */
  private attachProblems(
    sessionId: string,
    teacherId: string,
    questions: AuthoredQuestion[],
    cases: AuthoringCase[],
  ): Promise<AttachResult["testBundle"]> {
    return this.ds.transaction(async (m) => {
      const problems = await createProblemsFromAuthoring(m, sessionId, questions);
      let first: AttachResult["testBundle"] = null;
      for (const problem of problems) {
        const own = cases
          .filter((c) => c.questionIndex === problem.ordinal - 1)
          .map((c) => ({
            caseKey: c.caseKey,
            group: c.group,
            input: c.input,
            expectedOutput: c.expectedOutput,
          }));
        if (own.length === 0) {
          continue;
        }
        const bundle = await this.bundles.adoptFromAuthoringWithin(m, sessionId, teacherId, own, problem.problemId);
        if (problem.ordinal === 1) {
          first = bundle;
        }
      }
      return first;
    });
  }
}
