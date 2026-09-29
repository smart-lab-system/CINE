import type { GradingReferenceInput } from './api/grading';

/** Giá trị của radio "Không dùng đề bài". */
export const NO_QUESTION = '';

/**
 * Trạng thái của form tài liệu chấm — chuyển từ `GradingReferenceDialog` cũ, giữ nguyên luật của nó (spec §3.7:
 * "giữ luật *chỉ gửi trường đã đổi*").
 */
export interface ReferenceDraft {
  /** Giảng viên đã động vào nhóm radio đề bài chưa — cần cờ RIÊNG vì readiness chỉ trả boolean, không trả id. */
  questionTouched: boolean;
  questionId: string;
  note: string;
  /** Ghi chú lúc mở form. `grading-readiness` không trả nội dung ghi chú, nên luôn là chuỗi rỗng. */
  initialNote: string;
  /** Đáp án mẫu đã tải lên kho (khoá do server cấp) và tên file — cả hai hoặc không có gì. */
  storageKey: string | null;
  fileName: string | null;
}

/**
 * CHỈ gửi trường đã đổi. DTO phía server phân biệt ba trạng thái: không gửi = GIỮ NGUYÊN, gửi `null` = XOÁ,
 * gửi giá trị = ĐẶT. Gửi cả object mỗi lần sẽ gỡ mất lựa chọn đề bài ngay khi giảng viên chỉ sửa dòng ghi chú —
 * và họ không thấy gì bất thường cho tới lượt chấm sau.
 */
export function buildReferencePayload(draft: ReferenceDraft): GradingReferenceInput {
  const body: GradingReferenceInput = {};
  if (draft.questionTouched) {
    // `null` khi chọn "Không dùng đề bài": bấm gỡ mà không gửi thì thao tác của họ biến mất không dấu vết.
    body.questionMaterialId = draft.questionId === NO_QUESTION ? null : draft.questionId;
  }
  if (draft.note !== draft.initialNote) {
    body.modelAnswerNote = draft.note.trim() === '' ? null : draft.note.trim();
  }
  if (draft.storageKey && draft.fileName) {
    body.modelAnswerStorageKey = draft.storageKey;
    body.modelAnswerFilename = draft.fileName;
  }
  return body;
}

/** Có thay đổi chưa lưu không — kể cả file đã chọn nhưng chưa tải lên. Bật cờ này thì chưa được bắt đầu chấm. */
export function referenceIsDirty(draft: ReferenceDraft, hasPendingFile: boolean): boolean {
  return draft.questionTouched || draft.note !== draft.initialNote || hasPendingFile;
}
