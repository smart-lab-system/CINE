import type { GeneratedExam } from '@/lib/api/exam-authoring';

const KEY = 'examcollect:exam-draft';

/**
 * 24 giờ.
 *
 * Máy phòng máy là máy DÙNG CHUNG (spec soạn đề §9): một bản nháp đề chưa thi
 * nằm mãi trong `localStorage` của một máy mà sinh viên cũng ngồi là một
 * đường rò thật, không phải rủi ro lý thuyết.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredDraft {
  savedAt: number;
  exam: GeneratedExam;
}

export function saveDraft(exam: GeneratedExam): void {
  try {
    const payload: StoredDraft = { savedAt: Date.now(), exam };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Chế độ riêng tư, hoặc site data bị chặn. Mất nháp thì khó chịu; làm
    // hỏng cả màn hình soạn đề vì không ghi được thì tệ hơn nhiều.
  }
}

/**
 * `null` = không có nháp, nháp hỏng, hoặc nháp quá hạn.
 *
 * Cả ba trường hợp đều DỌN SẠCH chỗ, để lần sau không phải xử lý lại cùng một
 * rác — và để một bản nháp quá hạn không nằm lại trên máy dùng chung chỉ vì
 * chưa ai mở trang.
 */
export function loadDraft(): GeneratedExam | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredDraft;
    if (typeof parsed?.savedAt !== 'number' || !parsed.exam) {
      clearDraft();
      return null;
    }
    if (Date.now() - parsed.savedAt >= DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    return parsed.exam;
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
