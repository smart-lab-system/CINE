import { apiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth-token';
import { uploadExamMaterial } from '@/lib/api/exam-materials';

/**
 * Kiểu viết tay, soi gương backend — cùng khuôn với `lib/api/exam-session.ts`.
 * `apiClient.POST` vẫn kiểm cấu trúc với schema sinh ra ở chỗ gọi, nên lệch
 * vẫn là lỗi biên dịch, chỉ không phải lỗi import.
 */
export interface TestCase {
  name: string;
  group: string;
  input: string;
  expectedOutput: string;
}

export interface GeneratedQuestion {
  statement: string;
  points: number;
  topic: string;
  requiredComplexity: string | null;
  /** MÃ NGUỒN, không phải văn xuôi. */
  modelAnswer: string;
  testBundle: TestCase[];
  /** Lời TỰ KHAI của model, không phải kết quả đối chiếu. */
  resemblesKnownProblem: string | null;
}

export type Verification =
  | { status: 'unverified'; reason: 'sandbox_unavailable' }
  | { status: 'passed'; ranAt: string; complexityMeasured: string | null }
  | { status: 'failed'; failures: string[]; repairAttempts: number };

export interface GeneratedExam {
  title: string;
  language: string;
  questions: GeneratedQuestion[];
  verification: Verification;
}

/**
 * Bốn ngôn ngữ, không phải `string`.
 *
 * Siết lại sau khi regenerate schema: backend khai `@IsIn(AUTHORING_LANGUAGES)`
 * nên OpenAPI sinh ra một union literal, và `string` không gán vào đó được.
 * Kiểu chặt cũng đúng hơn cho `<select>` ở giao diện — nó chỉ có bốn lựa chọn.
 */
export type AuthoringLanguage = 'python' | 'cpp' | 'java' | 'node';

export const AUTHORING_LANGUAGES: readonly AuthoringLanguage[] = [
  'python',
  'cpp',
  'java',
  'node',
];

export interface GenerateExamInput {
  prompt: string;
  questionCount: number;
  language: AuthoringLanguage;
  /** Bài kinh điển phải tránh — điền từ `resemblesKnownProblem` của câu đang
   *  bị thay, KHÔNG phải giảng viên gõ. */
  avoid?: string[];
  /** Ghi chú lái của giảng viên. Đây là phần hệ thống không đoán được. */
  refineNote?: string;
  /** Đề các câu đang giữ, để câu mới không trùng ý. */
  existingStatements?: string[];
}

export async function generateExam(body: GenerateExamInput): Promise<GeneratedExam> {
  const { data, error, response } = await apiClient.POST('/exam-authoring/generate', {
    body,
  });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as GeneratedExam;
}

/**
 * Tải một file Word về máy, và trả lại chính `Blob` đó.
 *
 * KHÔNG dùng `apiClient`: `openapi-fetch` đọc body thành JSON, còn đây là nhị
 * phân. Nên `fetch` thẳng — và vì thế phải tự gắn Bearer, `apiClient` mới là
 * chỗ làm việc đó tự động.
 *
 * Trả `Blob` chứ không `void`: khi giảng viên gắn đề vào phiên thi, CHÍNH
 * TRÌNH DUYỆT `PUT` bytes này lên presigned URL (Security rule 5 — file không
 * bao giờ đi xuyên NestJS). Sinh lại file lần hai chỉ để upload là trả tiền
 * hai lần cho cùng một tài liệu, và hai lần sinh có thể ra hai file khác nhau
 * nếu giảng viên vừa sửa gì đó ở giữa.
 */
async function fetchDocx(path: string, exam: GeneratedExam): Promise<Blob> {
  const token = await getAccessToken();
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Chuỗi JSON, không phải object lồng: `ValidationPipe` chạy với
    // `whitelist: true` sẽ lược sạch một object không có DTO khai từng
    // trường, và endpoint nhận về `{}`.
    body: JSON.stringify({ examJson: JSON.stringify(exam) }),
  });
  if (!res.ok) {
    throw new Error(`Không xuất được file (HTTP ${res.status})`);
  }

  return res.blob();
}

/** Đẩy một blob đã có xuống máy người dùng. Tách khỏi `fetchDocx` vì luồng
 *  GẮN VÀO PHIÊN THI cần bytes mà KHÔNG muốn mở hộp tải về. */
function saveAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const PAPER_FILENAME = 'de-thi.docx';
export const ANSWER_KEY_FILENAME = 'dap-an-va-test.docx';

export function fetchExamPaper(exam: GeneratedExam): Promise<Blob> {
  return fetchDocx('/exam-authoring/export/paper', exam);
}

export function fetchAnswerKey(exam: GeneratedExam): Promise<Blob> {
  return fetchDocx('/exam-authoring/export/answer-key', exam);
}

export async function downloadExamPaper(exam: GeneratedExam): Promise<Blob> {
  const blob = await fetchExamPaper(exam);
  saveAs(blob, PAPER_FILENAME);
  return blob;
}

export async function downloadAnswerKey(exam: GeneratedExam): Promise<Blob> {
  const blob = await fetchAnswerKey(exam);
  saveAs(blob, ANSWER_KEY_FILENAME);
  return blob;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Gắn bộ ba vào một phiên thi: đề thành tài liệu phát cho sinh viên, đáp án
 * mẫu thành chuẩn để chấm.
 *
 * Hai đích đến KHÁC NHAU, và đó là cả vấn đề (spec soạn đề §8):
 *
 * - Đề vào `exam_material`, nơi `listForAgent` phát cho mọi agent sau
 *   `start_time`.
 * - Đáp án vào `grading_reference`, dưới prefix `grading-reference/` mà
 *   `listForAgent` KHÔNG BAO GIỜ chạm tới. Để nhầm chỗ là gửi đáp án về máy
 *   cả bốn mươi sinh viên.
 *
 * Bytes đi thẳng từ TRÌNH DUYỆT lên kho qua presigned URL — Security rule 5,
 * file không bao giờ đi xuyên NestJS.
 *
 * Gói test chưa gắn được ở bản này: bảng `grading_test_bundle` nằm ở nhánh
 * chưa merge. Nó vẫn nằm trong file Word đã xuất.
 */
export async function attachExamToSession(
  sessionId: string,
  exam: GeneratedExam,
): Promise<void> {
  const paper = await fetchExamPaper(exam);
  const material = await uploadExamMaterial(
    sessionId,
    new File([paper], PAPER_FILENAME, { type: DOCX_MIME }),
  );

  const minted = await apiClient.POST(
    '/exam-sessions/{id}/grading-reference/answer-key-upload',
    { params: { path: { id: sessionId } } },
  );
  if (minted.error || !minted.response.ok) {
    throw minted.error ?? new Error(`Không xin được URL upload (HTTP ${minted.response.status})`);
  }
  const { storageKey, uploadUrl } = minted.data as unknown as {
    storageKey: string;
    uploadUrl: string;
  };

  const answerKey = await fetchAnswerKey(exam);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: answerKey,
    headers: { 'Content-Type': DOCX_MIME },
  });
  if (!put.ok) {
    throw new Error(`Không tải được đáp án lên kho lưu trữ (HTTP ${put.status}).`);
  }

  const saved = await apiClient.PUT('/exam-sessions/{id}/grading-reference', {
    params: { path: { id: sessionId } },
    body: {
      questionMaterialId: material.id,
      modelAnswerStorageKey: storageKey,
      modelAnswerFilename: ANSWER_KEY_FILENAME,
      // Phiên mang dấu khi chuẩn chưa từng được chạy — xem
      // `grading-reference.entity.ts`.
      modelAnswerUnverified: exam.verification.status !== 'passed',
    },
  });
  if (saved.error || !saved.response.ok) {
    throw saved.error ?? new Error(`Không gắn được vào phiên (HTTP ${saved.response.status})`);
  }
}
