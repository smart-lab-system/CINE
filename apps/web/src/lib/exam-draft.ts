import type { AuthoringLanguage, GeneratedExam } from '@/lib/api/exam-authoring';

const KEY = 'examcollect:exam-draft';

/**
 * 24 giờ.
 *
 * Máy phòng máy là máy DÙNG CHUNG (spec soạn đề §9): một bản nháp đề chưa thi
 * nằm mãi trong `localStorage` của một máy mà sinh viên cũng ngồi là một
 * đường rò thật, không phải rủi ro lý thuyết.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * `prompt`/`questionCount`/`language` đi CÙNG `exam`, không tách riêng.
 *
 * Bug thật 2026-09-24: bản trước chỉ nhớ `exam`. Sau một lượt tải lại trang,
 * `exam` được khôi phục nhưng `prompt` ở component rơi về `''` (giá trị khởi
 * tạo của `useState`) — và "Sinh lại riêng câu này" gửi thẳng `prompt` đó
 * lên, bị `GenerateExamDto.prompt` (`@Length(10, 2000)`) từ chối 400. Model
 * cũng CẦN `prompt` gốc để sinh câu thay thế đúng mạch với cả đề (xem
 * "Yêu cầu của giảng viên lần này" trong `buildAuthoringPrompt`) — không chỉ
 * để qua được validation.
 */
export interface ExamDraft {
  exam: GeneratedExam;
  prompt: string;
  questionCount: number;
  language: AuthoringLanguage;
}

/** `ExamDraft` cộng `savedAt` — chỉ để TÍNH HẠN, không lộ ra ngoài module này
 *  (`loadDraft` trả `ExamDraft`, cùng quy ước với bản trước trả `exam` trần,
 *  không kèm phong bì lưu trữ). */
interface StoredDraft extends ExamDraft {
  savedAt: number;
}

export function saveDraft(
  exam: GeneratedExam,
  prompt: string,
  questionCount: number,
  language: AuthoringLanguage,
): void {
  try {
    const payload: StoredDraft = { savedAt: Date.now(), exam, prompt, questionCount, language };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Chế độ riêng tư, hoặc site data bị chặn. Mất nháp thì khó chịu; làm
    // hỏng cả màn hình soạn đề vì không ghi được thì tệ hơn nhiều.
  }
}

/**
 * `null` = không có nháp, nháp hỏng, nháp quá hạn, hoặc nháp ở HÌNH DẠNG CŨ
 * (lưu trước lượt vá bug ở trên, thiếu `prompt`/`questionCount`/`language`).
 *
 * Nháp hình dạng cũ CỐ Ý bị coi là hỏng thay vì khôi phục nửa vời (`exam` có,
 * `prompt` rỗng) — nửa vời đó CHÍNH LÀ trạng thái gây ra bug, chỉ đổi chỗ
 * phát hiện từ "sau khi tải lại trang" sang "không còn ai nhớ để tránh".
 * Nháp hình dạng cũ trên máy giảng viên cũng tự hết hạn trong 24 giờ.
 *
 * Mọi trường hợp đều DỌN SẠCH chỗ, để lần sau không phải xử lý lại cùng một
 * rác — và để một bản nháp quá hạn không nằm lại trên máy dùng chung chỉ vì
 * chưa ai mở trang.
 */
export function loadDraft(): ExamDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (
      typeof parsed?.savedAt !== 'number' ||
      !parsed.exam ||
      typeof parsed.prompt !== 'string' ||
      typeof parsed.questionCount !== 'number' ||
      typeof parsed.language !== 'string'
    ) {
      clearDraft();
      return null;
    }
    if (Date.now() - parsed.savedAt >= DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    // `savedAt` chỉ để tính hạn ở TRÊN — không trả ra ngoài, xem doc `ExamDraft`.
    const { exam, prompt, questionCount, language } = parsed as StoredDraft;
    return { exam, prompt, questionCount, language };
  } catch {
    clearDraft();
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Xem `saveDraft`.
  }
}
