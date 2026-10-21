/** Loại nhóm: bài có đúng một luật lỗi, bài có từ hai luật trở lên, bài không có lỗi nào (spec 2026-10-21 §5.4). */
export type ReviewGroupKind = 'single' | 'multi' | 'none';

/**
 * Một nhóm bài bị gắn cờ, gom theo lỗi của lượt tính MỚI NHẤT — hình dạng `GET exam-sessions/:id/review-groups` trả.
 * Hàm thuần `groupResults` điền `label = ruleId` và `description = null`; `ReviewGroupService` thay bằng tên và mô
 * tả của bản sửa hiện hành của luật.
 */
export interface ReviewGroup {
  /** ruleId với nhóm `single`; `'multi'` hoặc `'none'` với hai nhóm còn lại. */
  key: string;
  label: string;
  description: string | null;
  /** Các `source` của lỗi có trong nhóm, không trùng, tăng dần. Rỗng với nhóm `none`. */
  sources: string[];
  kind: ReviewGroupKind;
  ruleId: string | null;
  /** Id bài, tăng dần. */
  resultIds: string[];
  /** Tối đa 3: ba id đầu của `resultIds`. */
  sampleResultIds: string[];
}

/** Một bài và các lỗi trong `breakdown.errors` của lượt tính mới nhất của nó. Một dòng một bài. */
export interface GroupInput {
  resultId: string;
  errors: { ruleId: string; source: string }[];
}
