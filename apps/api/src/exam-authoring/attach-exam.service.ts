import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ExamSessionService } from "../exam-session/exam-session.service";
import { ExamMaterialService } from "../exam-session/exam-material.service";
import {
  ExamSessionEntity,
  ExamSessionStatus,
} from "../exam-session/entities/exam-session.entity";
import { GradingReferenceService } from "../grading/grading-reference.service";
import { StorageService } from "../storage/storage.service";
import { buildExamPaperDocx } from "./docx/exam-paper.docx";
import { buildAnswerKeyDocx } from "./docx/answer-key.docx";
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

    const [paper, answerKey] = await Promise.all([
      buildExamPaperDocx(exam),
      buildAnswerKeyDocx(exam),
    ]);

    // Đáp án ĐI TRƯỚC, và nằm ở khoá cố định của phiên (prefix
    // `grading-reference/`, không bao giờ lọt vào `listForAgent`). Hỏi
    // `requestAnswerKeyUpload` để lấy khoá thay vì tự ghép chuỗi: cách ghép
    // khoá đó là cơ chế giữ đáp án khỏi tay sinh viên, và nó phải có đúng
    // một chỗ định nghĩa. URL ký kèm theo thì bỏ — bytes đã nằm trong bộ nhớ
    // tiến trình này rồi, tự PUT vào URL của chính mình chỉ thêm hai chặng
    // mạng và một cách hỏng mới.
    const { storageKey: answerKeyKey } =
      await this.references.requestAnswerKeyUpload(session);
    await this.storage.putObject(answerKeyKey, answerKey, DOCX_MIME);

    const examMaterialId = randomUUID();
    const paperKey = this.storage.buildMaterialKey(session.id, examMaterialId);
    await this.storage.putObject(paperKey, paper, DOCX_MIME);

    const material = await this.materials.create(session, {
      examMaterialId,
      storageKey: paperKey,
      fileName: PAPER_FILENAME,
      fileSize: paper.length,
    });

    try {
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
      );
    } catch (error) {
      // Gỡ đúng thứ vừa tạo. Không đụng tới object đáp án: khoá của nó là
      // khoá CỐ ĐỊNH của phiên, nên xoá đi là xoá luôn đáp án của lần gắn
      // trước nếu có.
      await this.materials
        .remove(session, material.id)
        .catch((cleanupError: unknown) => {
          this.logger.error(
            `Gắn đề hỏng và dọn material ${material.id} cũng hỏng — còn lại một dòng mồ côi`,
            cleanupError instanceof Error
              ? cleanupError.stack
              : String(cleanupError),
          );
        });
      throw error;
    }

    return {
      examMaterialId: material.id,
      paperFilename: PAPER_FILENAME,
      answerKeyFilename: ANSWER_KEY_FILENAME,
    };
  }
}
