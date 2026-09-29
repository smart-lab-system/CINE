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

type Verdict = 'confirmed' | 'refuted' | 'unverified';

/**
 * Gộp kết luận của nhiều góc kiểm cho MỘT lỗi — đúng luật của backend (mergedStatusOf, decision/decide.ts,
 * finding W5): một góc bác bỏ là đủ để bác bỏ; một góc xác nhận là đủ để xác nhận miễn là không ai bác bỏ;
 * "chưa kiểm được" chỉ khi KHÔNG góc nào trả lời được. Không dùng "tệ nhất thắng": nó tô vàng một dòng mà nút
 * hành động (theo cờ backend) đối xử như đã xác nhận (Review Focus #5).
 */
export function mergedVerdict(statuses: Verdict[]): Verdict {
  if (statuses.includes('refuted')) return 'refuted';
  if (statuses.includes('confirmed')) return 'confirmed';
  return 'unverified';
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

/** Kết quả một lời gọi công cụ bằng CHỮ (spec §2.1 luật 1) — bốn trạng thái của ToolCallStatus ở backend. */
const TOOL_CALL_STATUS_LABEL: Record<string, string> = {
  ok: 'Xong',
  error: 'Lỗi',
  blocked_duplicate: 'Bị chặn — trùng lời gọi trước',
  unavailable: 'Không dùng được',
};
export function toolCallStatusLabel(status: string): string {
  return TOOL_CALL_STATUS_LABEL[status] ?? status;
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
