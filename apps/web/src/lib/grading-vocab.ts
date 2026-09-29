import type { BadgeProps } from '@/components/ui/badge';

/**
 * Bảng quy đổi lời văn — spec UI §2.2. Nhãn ở ĐÂY là chuẩn. Nếu một chỗ
 * khác trong code lệch bảng này (ví dụ "Model" thay vì "Mô hình"), sửa
 * theo bảng này — spec §2.2 tự nêu đích danh mockup còn phạm luật ở bốn
 * chỗ, và đây là nơi sửa cả bốn.
 */
export const SOURCE_LABEL: Record<
  'deterministic' | 'llm_with_tools' | 'llm_only',
  { label: string; variant: BadgeProps['variant'] }
> = {
  deterministic: { label: 'Máy quyết', variant: 'accent' },
  llm_with_tools: { label: 'Mô hình + công cụ', variant: 'info' },
  llm_only: { label: 'Chỉ mô hình', variant: 'warning' },
};

export const VERDICT_LABEL: Record<
  'confirmed' | 'refuted' | 'unverified',
  { label: string; variant: BadgeProps['variant']; tintClass: string }
> = {
  confirmed: { label: 'Xác nhận', variant: 'success', tintClass: 'bg-success-subtle' },
  refuted: { label: 'Bác bỏ', variant: 'destructive', tintClass: 'bg-danger-subtle' },
  unverified: { label: 'Chưa kiểm được', variant: 'warning', tintClass: 'bg-warning-subtle' },
};

/** Thứ tự tệ dần — dùng để tô một dòng lỗi khi nhiều góc kiểm kết luận khác nhau (Review Focus #5). */
const VERDICT_SEVERITY: Record<'confirmed' | 'refuted' | 'unverified', number> = {
  confirmed: 0,
  unverified: 1,
  refuted: 2,
};
export function worstVerdict(statuses: Array<'confirmed' | 'refuted' | 'unverified'>) {
  return statuses.reduce((worst, s) => (VERDICT_SEVERITY[s] > VERDICT_SEVERITY[worst] ? s : worst), statuses[0]);
}

const LENS_LABEL: Record<string, string> = {
  tinh_dung: 'Tính đúng',
  qua_tay: 'Quá tay',
  bo_sot: 'Bỏ sót',
  gian_lan: 'Gian lận',
};
export function lensLabel(key: string): string {
  return LENS_LABEL[key] ?? key;
}

/** Tên VIỆC hiện đầu mỗi dòng đường điều tra — không phải tên công cụ (spec §2.2, sửa vi phạm #3). */
const TOOL_ACTION_LABEL: Record<string, string> = {
  run_tests: 'Chạy gói test',
  run_scaled: 'Đo độ phức tạp',
  probe: 'Dò biên',
  ast_query: 'Đọc cấu trúc mã',
  read_file: 'Đọc file',
  run: 'Chạy chương trình',
  list_files: 'Liệt kê file',
};
export function toolActionLabel(tool: string): string {
  return TOOL_ACTION_LABEL[tool] ?? tool;
}

const CASE_FLAG_LABEL: Record<string, string> = {
  criterion_without_rules: 'Tiêu chí chưa có luật nào',
  criterion_untouched: 'Tiêu chí chưa được kiểm tới',
  nothing_passed: 'Không ca test nào đạt — hệ thống không tự cho điểm',
  low_confidence: 'Độ tin dưới ngưỡng tự quyết',
  not_code_pipeline: 'Bài tự luận — luôn do bạn duyệt',
  challenge_suspected: 'Góc kiểm gian lận nêu nghi vấn',
};

const INVESTIGATION_FLAG_LABEL: Record<string, string> = {
  injection_suspected: 'Bài nộp có câu lệnh nhắm vào AI chấm',
  replay_mismatch: 'Chạy lại để đối chiếu ra kết quả khác',
  replay_unverified: 'Chưa chạy lại để đối chiếu được',
  evidence_rejected: 'Bằng chứng không khớp lời gọi thật',
  budget_exhausted: 'Hết lượt điều tra trước khi xong',
};

/**
 * Nhãn CHÍNH của một cờ cấp bài. `detail` luôn hiện thêm ở dòng phụ dạng
 * mono — bao gồm cả khi nó chỉ lặp lại mã (`investigation_flag`), vì đó là
 * đúng thứ tự spec §2.2 mô tả. Không cờ nào bị bỏ im lặng: mã lạ vẫn ra
 * một dòng có tên, không phải một khối rỗng.
 */
export function caseFlagLabel(code: string, detail: string): string {
  if (code === 'investigation_flag') {
    return INVESTIGATION_FLAG_LABEL[detail] ?? `Điều kiện chưa có tên hiển thị (${detail})`;
  }
  return CASE_FLAG_LABEL[code] ?? `Điều kiện chưa có tên hiển thị (${code})`;
}
