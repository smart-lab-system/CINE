import type { GradingResult, ResultDetail } from './api/grading';
import { formatVnPoints } from './format';
import { caseFlagLabel } from './grading-vocab';

/**
 * Bảy trạng thái hiển thị của một bài trong phiên (spec §3.3) — suy từ `status` và `ungradableReason`, vì
 * không trường nào nói thẳng: "cần bạn xem" và "không chấm được" đều là `flagged_for_review` (§4.4).
 *
 * Toàn bộ file là hàm thuần, không chạm DOM hay mạng: một phép phân loại sai không làm đỏ test nào khác, nó
 * chỉ đưa bài vào nhầm ô và giảng viên tin con số.
 */
export type SessionState = 'needsYou' | 'audit' | 'ungradable' | 'grading' | 'auto' | 'reviewed' | 'finalised';

/** Việc cần làm trước, việc đã xong sau — "cần bạn và kiểm mẫu trước, tự quyết sau". */
export const STATE_ORDER: SessionState[] = ['needsYou', 'audit', 'ungradable', 'grading', 'auto', 'reviewed', 'finalised'];

export const STATE_LABEL: Record<SessionState, string> = {
  needsYou: 'Cần bạn xem',
  audit: 'Kiểm mẫu',
  ungradable: 'Không chấm được',
  grading: 'Đang chấm',
  auto: 'Tự quyết',
  reviewed: 'Đã duyệt',
  finalised: 'Đã chốt',
};

export function stateOf(result: Pick<GradingResult, 'status' | 'ungradableReason'>): SessionState {
  switch (result.status) {
    case 'auto_approved':
      return 'auto';
    case 'audit_pending':
      return 'audit';
    case 'teacher_reviewed':
      return 'reviewed';
    case 'finalized':
    case 'exported':
      return 'finalised';
    case 'flagged_for_review':
      return result.ungradableReason !== null ? 'ungradable' : 'needsYou';
    default:
      // ai_grading, ai_graded và mọi giá trị thêm về sau: vẫn HIỆN và vẫn CHẶN chốt — cái giá của việc giấu
      // một bài lớn hơn hẳn việc xếp nó nhầm nhóm.
      return 'grading';
  }
}

export function countStates(results: GradingResult[]): Record<SessionState, number> {
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<SessionState, number>;
  for (const r of results) counts[stateOf(r)] += 1;
  return counts;
}

/** Theo trạng thái rồi theo MSSV (so như số). Không đổi mảng đầu vào. */
export function sortByState(results: GradingResult[]): GradingResult[] {
  return [...results].sort(
    (a, b) =>
      STATE_ORDER.indexOf(stateOf(a)) - STATE_ORDER.indexOf(stateOf(b)) ||
      a.studentMssv.localeCompare(b.studentMssv, 'vi', { numeric: true }),
  );
}

export type ScoreTag = 'tạm tính' | 'chấm tay' | 'đã chốt' | 'chưa có điểm';

/**
 * Ô điểm. MỌI điểm đọc từ `currentScore` (§14.2) — không `aiTotalScore`, không `finalScore`. `null` là "—",
 * không bao giờ 0: "chưa có điểm" và "điểm 0" là hai chuyện khác nhau.
 */
export function scoreCell(result: Pick<GradingResult, 'currentScore' | 'currentScoreSource'>, state: SessionState): { text: string; tag: ScoreTag } {
  const score = result.currentScore ?? null;
  if (score === null) return { text: '—', tag: 'chưa có điểm' };
  const text = formatVnPoints(score);
  if (state === 'finalised') return { text, tag: 'đã chốt' };
  if (result.currentScoreSource === 'manual') return { text, tag: 'chấm tay' };
  return { text, tag: 'tạm tính' };
}

/** Đúng tập mà `BLOCKS_FINALIZE` của server chặn (lifecycle/grading-transitions.ts). */
export function blockers(results: GradingResult[]) {
  const c = countStates(results);
  return {
    needsYou: c.needsYou,
    audit: c.audit,
    ungradable: c.ungradable,
    grading: c.grading,
    remaining: c.needsYou + c.audit + c.ungradable + c.grading,
  };
}

/** Hai con số của hộp xác nhận chốt (T-UI-16): cộng lại bằng số bài khi không còn gì chặn. */
export function finalizeCounts(results: GradingResult[]) {
  const c = countStates(results);
  return { acceptedUnopened: c.auto, reviewed: c.reviewed, alreadyFinal: c.finalised };
}

export function errorCounts(detail: ResultDetail | undefined): { counted: number; unpriced: number; refuted: number; unverified: number } | null {
  const breakdown = detail?.breakdown;
  if (!breakdown) return null;
  const count = (counted: string) => breakdown.errors.filter((e) => e.counted === counted).length;
  return {
    counted: count('counted'),
    unpriced: count('unpriced'),
    refuted: count('refuted'),
    unverified: new Set(breakdown.errorFlags.filter((f) => f.code === 'unverified').map((f) => f.ruleKey)).size,
  };
}

const distinct = (flags: { ruleKey: string; code: string }[], code: string) =>
  new Set(flags.filter((f) => f.code === code).map((f) => f.ruleKey)).size;

/**
 * "Vì sao cần bạn" — MỘT câu, ghép từ dữ liệu thật của hồ sơ. `null` = chưa biết (hồ sơ chưa tải); màn hình nói
 * "đang xem hồ sơ", không đoán.
 */
export function reasonOf(result: GradingResult, detail: ResultDetail | undefined): string | null {
  const state = stateOf(result);
  if (state === 'ungradable') return result.ungradableReason;
  if (state !== 'needsYou') return null;
  if (result.pipeline === 'one_shot') return 'Bài tự luận — luôn do bạn duyệt';

  const breakdown = detail?.breakdown;
  if (!breakdown) return null;

  const parts: string[] = breakdown.caseFlags.map((f) => caseFlagLabel(f.code, f.detail));
  const unpriced = distinct(breakdown.errorFlags, 'unpriced');
  if (unpriced > 0) parts.push(`${unpriced} luật chưa có giá`);
  const unverified = distinct(breakdown.errorFlags, 'unverified');
  if (unverified > 0) parts.push(`${unverified} lỗi chưa kiểm được`);
  const refuted = distinct(breakdown.errorFlags, 'refuted');
  if (refuted > 0) parts.push(`${refuted} lỗi bị bác bỏ`);

  return parts.length > 0 ? parts.join(' · ') : 'Hồ sơ không nêu lý do cụ thể — mở hồ sơ để xem.';
}

/**
 * Dòng nhắc đòn bẩy (spec §3.3): "W trong T bài cần xem chỉ chờ bạn đặt giá cho R luật".
 *
 * KHÔNG nói gì (`null`) chừng nào còn một hồ sơ chưa tải — một lời khẳng định dựng trên dữ liệu thiếu là lời
 * khẳng định sai. Bài tự luận tính vào T nhưng không bao giờ "chỉ chờ giá" (nó luôn do người duyệt).
 *
 * "Chỉ chờ giá" ở đây nghĩa là: lý do DUY NHẤT đang hiện ra là giá. Nó KHÔNG hứa rằng đặt giá là đủ — `decide()`
 * giấu cờ `low_confidence` khi còn cờ khác (decide.ts:188), nên sau khi đặt giá, lý do đó có thể lộ ra (đã kiểm
 * trên API thật). Lời hiển thị vì vậy nói "đang chờ", không nói "chỉ chờ".
 */
export function leverageOf(
  needsYou: GradingResult[],
  detailsById: Map<string, ResultDetail>,
): { waiting: number; total: number; ruleKeys: string[] } | null {
  const investigators = needsYou.filter((r) => r.pipeline !== 'one_shot');
  if (investigators.some((r) => !detailsById.has(r.id))) return null;

  const ruleKeys = new Set<string>();
  let waiting = 0;
  for (const r of investigators) {
    const breakdown = detailsById.get(r.id)?.breakdown;
    if (!breakdown) continue;
    const unpriced = breakdown.errorFlags.filter((f) => f.code === 'unpriced');
    const onlyPrices =
      unpriced.length > 0 && breakdown.caseFlags.length === 0 && breakdown.errorFlags.every((f) => f.code === 'unpriced');
    if (!onlyPrices) continue;
    waiting += 1;
    for (const f of unpriced) ruleKeys.add(f.ruleKey);
  }
  return waiting > 0 ? { waiting, total: needsYou.length, ruleKeys: [...ruleKeys].sort() } : null;
}
