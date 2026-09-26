import { AUTO_APPROVE_CONFIDENCE } from '../grading.types';

const KEY = 'GRADING_AUTO_THRESHOLD';

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
