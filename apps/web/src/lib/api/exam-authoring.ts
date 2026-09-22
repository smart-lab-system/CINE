import { apiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth-token';

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

/**
 * Gắn bộ ba vào một phiên thi — MỘT lượt gọi, server làm trọn.
 *
 * Bản trước xâu bốn lượt từ đây: xuất đề → tạo material → xin URL đáp án →
 * PUT đáp án → ghi grading reference. Bỏ đi vì hai lý do, và cả hai đều
 * không sửa được ở phía trình duyệt:
 *
 * - luật "phiên nào gắn được" khi ấy chỉ sống trong một cái radio bị
 *   disabled, nên một request đi thẳng vào API là qua sạch;
 * - hỏng ở lượt cuối để lại một `exam_material` mồ côi cùng file trên kho,
 *   giảng viên phải tự dọn.
 *
 * Server dựng lại hai file Word từ chính `examJson` này, nên thứ gắn vào
 * phiên và thứ giảng viên tải về là cùng một mã sinh ra.
 */
export async function attachExamToSession(
  sessionId: string,
  exam: GeneratedExam,
): Promise<void> {
  const res = await apiClient.POST('/exam-authoring/attach', {
    body: { examSessionId: sessionId, examJson: JSON.stringify(exam) },
  });
  if (res.error || !res.response.ok) {
    throw res.error ?? new Error(`Không gắn được vào phiên (HTTP ${res.response.status})`);
  }
}
