/**
 * Nhãn tiếng Việt cho nhật ký thao tác. Backend ghi MÃ (hành động, loại đối tượng, tên trường); màn admin không được
 * đưa mã nội bộ cho người đọc. Mã nào chưa có nhãn thì giữ nguyên mã để người quản trị vẫn tra được, thay vì bịa nhãn.
 *
 * Danh sách hành động khớp các chỗ gọi `recordUserAction` ở apps/api. Thêm hành động mới ở backend thì thêm một dòng
 * ở đây; thiếu dòng chỉ làm hành động đó hiện mã thô, không làm hỏng màn.
 */
export const ACTION_LABEL: Record<string, string> = {
  'grading_result.score_edited_after_finalize': 'Sửa điểm sau khi chốt',
  'grading_result.manual_score_after_finalize': 'Chấm tay sau khi chốt',
  'grading_result.score_reapplied_after_finalize': 'Cập nhật mức trừ sau khi chốt',
  'grade_export.score_decreased_confirmed': 'Xác nhận ghi điểm giảm vào sổ điểm',
  'exam_session.reassign_teacher': 'Chuyển phiên thi cho giảng viên khác',
  'exam_session.access_granted': 'Cho sinh viên vào phiên thi',
};

export const TARGET_LABEL: Record<string, string> = {
  exam_session: 'Phiên thi',
  grading_result: 'Kết quả chấm',
  grade_export: 'Lần ghi sổ điểm',
};

export const FIELD_LABEL: Record<string, string> = {
  finalScore: 'Điểm chốt',
  score: 'Điểm',
  priceTableVersionId: 'Phiên bản bảng mức trừ',
  computationId: 'Lần tính điểm',
  changedRules: 'Quy tắc đã đổi',
  appliedRule: 'Quy tắc áp dụng',
  privateNote: 'Ghi chú riêng',
  teacherId: 'Giảng viên phụ trách',
  studentMssv: 'MSSV',
  studentName: 'Họ tên sinh viên',
  reason: 'Lý do',
  homeClassId: 'Lớp gốc',
  decreased: 'Các bài bị giảm điểm',
};

/** Các hành động có nhãn, cho ô lọc. */
export const ACTION_OPTIONS: { code: string; label: string }[] = Object.entries(ACTION_LABEL).map(([code, label]) => ({ code, label }));

/** Nhãn của mã, hoặc `null` khi chưa có (người gọi giữ mã thô). */
export const actionLabel = (code: string): string | null => ACTION_LABEL[code] ?? null;
export const targetLabel = (code: string): string => TARGET_LABEL[code] ?? code;
export const fieldLabel = (code: string): string | null => FIELD_LABEL[code] ?? null;
