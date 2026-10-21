import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';

const KEY = 'GRADING_AUTO_THRESHOLD';

/**
 * Dung sai so sánh `confidence < θ` trong `decide()` (spec §5.1). `caseConfidence` là trung bình có trọng số bằng
 * số thực nên một lỗi `llm_with_tools` (trần 0,85) mức trừ 13 cho 0,85×13/13 = 0,8499999999999999 — nhỏ hơn θ 0,85 một
 * ULP dù về mặt toán học bằng nhau. Sai số làm tròn (cỡ 1e-16) nhỏ hơn dung sai nhiều bậc, còn chênh lệch thật giữa hai
 * confidence khác nhau (mức trừ là số nguyên hundredths) cỡ 1e-5 trở lên với bảng lỗi thực tế (tổng mức trừ vài nghìn hundredths), lớn hơn dung sai nhiều bậc.
 * Hằng số, không phải cấu hình. Công thức confidence KHÔNG đổi — chỉ phép so sánh.
 */
export const AUTO_THETA_EPSILON = 1e-9;

/**
 * θ của công thức tự quyết (§4.2): đọc từ env, mặc định là hằng số hôm nay. Chỉ `decide()` gọi
 * hàm này — không chỗ nào khác của đường chấm mới đọc thẳng hằng số (T-AUTO-1). Env CÓ đặt mà
 * rỗng hay vô nghĩa → mặc định KÈM cảnh báo: im lặng là giấu một lần gõ nhầm.
 */
export function readAutoThreshold(env: NodeJS.ProcessEnv): { theta: number; warning: string | null } {
  const set = env[KEY];
  if (set === undefined) return { theta: AUTO_APPROVE_CONFIDENCE, warning: null };
  const value = set.trim() === '' ? NaN : Number(set);
  if (Number.isFinite(value) && value > 0 && value <= 1) return { theta: value, warning: null };
  return {
    theta: AUTO_APPROVE_CONFIDENCE,
    warning: `${KEY}=${JSON.stringify(set)} không phải số trong (0, 1] — dùng mặc định ${AUTO_APPROVE_CONFIDENCE}`,
  };
}

const BLOCK_KEY = 'GRADING_AUTO_BLOCK_RULE_KEYS';
const NO_ERROR_KEY = 'GRADING_AUTO_NO_ERROR';

/**
 * Công tắc khẩn cấp chặn tự chốt theo khoá luật (§5.2), áp cho MỌI giảng viên. Cùng khuôn `readAutoThreshold`:
 * hàm thuần nhận `env`, nơi gọi đọc một lần lúc khởi tạo rồi truyền xuống `decide()` — `decide()` không đọc env.
 * Không đặt / rỗng → tập rỗng, không chặn gì (hành vi hôm nay). Tách dấu phẩy, bỏ khoảng trắng và mục rỗng.
 * KHÔNG kiểm khoá với bảng lỗi ở đây: khoá lạ không khớp lỗi nào nên không chặn gì. Đặt mà không ra khoá nào
 * (vd `" , "`) → tập rỗng KÈM cảnh báo: im lặng là giấu một lần gõ nhầm.
 */
export function readAutoBlockedRules(env: NodeJS.ProcessEnv): { keys: ReadonlySet<string>; warning: string | null } {
  const raw = env[BLOCK_KEY];
  if (raw === undefined || raw.trim() === '') return { keys: new Set(), warning: null };
  const keys = new Set(
    raw
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k !== ''),
  );
  if (keys.size > 0) return { keys, warning: null };
  return { keys, warning: `${BLOCK_KEY}=${JSON.stringify(raw)} không có khoá luật nào — không chặn luật nào` };
}

/**
 * Tự chốt bài không lỗi có bật không (§5.2). Chỉ nhận đúng `true`/`false` (sau khi bỏ khoảng trắng). Không đặt →
 * `true` (hành vi hôm nay), không cảnh báo. Đặt mà rỗng, toàn khoảng trắng hay vô nghĩa → `true` KÈM cảnh báo, như
 * `readAutoThreshold`: đây là công tắc khẩn cấp, `true` là giá trị dễ dãi, nên một biến đặt rỗng không được lặng lẽ
 * giấu một lần cấu hình hỏng.
 */
export function readAutoNoError(env: NodeJS.ProcessEnv): { enabled: boolean; warning: string | null } {
  const raw = env[NO_ERROR_KEY];
  if (raw === undefined) return { enabled: true, warning: null };
  const value = raw.trim();
  if (value === 'true') return { enabled: true, warning: null };
  if (value === 'false') return { enabled: false, warning: null };
  return {
    enabled: true,
    warning: `${NO_ERROR_KEY}=${JSON.stringify(raw)} không phải "true" hay "false" — dùng mặc định true`,
  };
}
