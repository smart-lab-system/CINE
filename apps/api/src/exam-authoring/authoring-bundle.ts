import type { GeneratedQuestion } from './ai-provider/exam-authoring-provider';

/**
 * Một ca của gói test, đã đi qua những ràng buộc mà DB đặt ra.
 *
 * Khớp từng trường một với `CreateTestBundleDto` (mục đích chính là sao
 * chép được) và với các `CHECK` của `grading_test_case` trong migration
 * `1789450000000-AttemptsBundlesScores.ts`.
 */
export interface AuthoringCase {
  caseKey: string;
  group: string;
  input: string;
  expectedOutput: string;
  /** Chỉ số câu (từ 0) trong đề mà ca này thuộc về. Đường nhiều câu dùng nó để tách gói theo câu (P1b). */
  questionIndex: number;
}

/** `CHECK (case_key ~ '^[A-Za-z0-9_-]{1,64})` — viết lại đúng biểu thức đó. */
const CASE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/** `CHECK (length("group") BETWEEN 1 AND 100)`. */
const MAX_GROUP_LENGTH = 100;

const MAX_CASE_KEY_LENGTH = 64;

/**
 * Làm phẳng `testBundle` của MỌI câu trong đề thành các ca của MỘT gói
 * test của phiên.
 *
 * Hàm thuần: không chạm DB, không chạm storage, không đụng hệ thống tệp.
 * Nó là thứ duy nhất ở đây test được bằng unit, và mọi luật ràng buộc của
 * DB (regex, độ dài, khoá duy nhất) đều nên chết ở một test nhanh chứ
 * không phải ở một `INSERT` giữa e2e — nơi một việc sai làm hỏng cả một
 * lần gắn đề thành 500 mà không ai biết vì sao.
 *
 * Vì sao làm phẳng chứ không một gói mỗi câu: `exam_session` ghim được
 * đúng MỘT `test_bundle_id`, và §14.1 nói thước là của cả phiên. Số thứ
 * tự câu nằm trong tiền tố `q{n}-` nên vẫn truy ngược được ca nào kiểm
 * câu nào.
 */
export function flattenAuthoringCases(questions: GeneratedQuestion[]): AuthoringCase[] {
  const used = new Set<string>();
  const out: AuthoringCase[] = [];

  questions.forEach((question, questionIndex) => {
    const questionNumber = questionIndex + 1;
    question.testBundle.forEach((testCase, caseIndex) => {
      const base = caseKeyFor(questionNumber, caseIndex, testCase.name);
      let key = base;
      // `uq_grading_test_case_key (bundle_id, case_key)`: trùng là 500.
      // Cắt base theo ĐỘ DÀI THẬT của hậu tố (`-2` ngắn hơn `-100`) để khoá
      // luôn nằm trong 64.
      for (let n = 2; used.has(key); n += 1) {
        const suffix = `-${n}`;
        key = `${base.slice(0, MAX_CASE_KEY_LENGTH - suffix.length)}${suffix}`;
      }
      used.add(key);
      out.push({
        caseKey: key,
        group: groupFor(testCase.group),
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        questionIndex,
      });
    });
  });

  return out;
}

/**
 * `q{n}-{tên đã làm sạch}`, và rơi về `q{n}-c{i}` khi tên rỗng hoặc toàn
 * ký tự mà `slug` xoá hết.
 *
 * Giữ lại tên ca là chủ ý: đây là cột giảng viên đọc trong bảng duyệt
 * (UI spec §3.7), và một danh sách toàn `q3c0`, `q3c1` không giúp họ
 * nhận ra ca nào là ca nào.
 */
function caseKeyFor(questionNumber: number, caseIndex: number, name: string): string {
  const prefix = `q${questionNumber}-`;
  const slug = slugify(name);
  const candidate = slug
    ? `${prefix}${slug}`.slice(0, MAX_CASE_KEY_LENGTH)
    : `${prefix}c${caseIndex}`;
  // Cắt có thể tạo lại một khoá rỗng hoặc kết thúc bằng `-`; ép lại lần nữa.
  const fixed = candidate.replace(/^-+|-+$/g, '') || `${prefix}c${caseIndex}`;
  return CASE_KEY_REGEX.test(fixed) ? fixed : `${prefix}c${caseIndex}`;
}

/**
 * Bỏ dấu tiếng Việt, hạ chữ thường, mọi ký tự ngoài `[A-Za-z0-9_-]` thành
 * `-`, gộp `-` liên tiếp.
 */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // 'đ' KHÔNG tách được bằng NFD (nó là một chữ cái riêng, không phải d + dấu) — bỏ qua bước này thì
    // "đồ thị" thành "o-thi", mất hẳn một chữ.
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `group` khớp `rubric_criterion.test_group` của nhánh autograder, nên nó
 * là một KHOÁ nối chứ không phải nhãn hiển thị: cắt câm giữa chừng là
 * biến một nhóm thành một nhóm khác hẳn. Vì vậy chỉ có hai cách — giữ
 * nguyên, hoặc thay bằng `general`.
 */
function groupFor(group: string): string {
  const trimmed = group.trim();
  if (trimmed === '' || trimmed.length > MAX_GROUP_LENGTH) {
    return 'general';
  }
  return trimmed;
}
