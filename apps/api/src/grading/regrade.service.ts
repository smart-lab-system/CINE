import type { GradingResultStatus } from './entities/grading-result.entity';
import type { UngradableClass } from './grading-model.types';

/**
 * Chấm lại bài KHÔNG CHẤM ĐƯỢC do lỗi hệ thống (spec §2.3).
 *
 * Không nhầm với `grading-regrade.spec.ts`: file đó nói về lần chấm lại NỘI BỘ đúng một lần khi ≥ 50% dẫn
 * chứng không kiểm chứng được (T-G2-1b). Ở đây là giảng viên bấm nút, cho bài chưa có điểm nào.
 */
export interface RegradeSkip {
  resultId: string;
  /** Câu tiếng Việt để hiện thẳng cho giảng viên — không phải mã lỗi. */
  reason: string;
}

export interface RegradeOutcome {
  requeued: number;
  skipped: RegradeSkip[];
}

export const REGRADE_MESSAGES = {
  in_progress: 'Bài này đang được chấm — chưa cần chấm lại.',
  has_score:
    'Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký.',
  submission_class:
    'Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.',
  not_ungradable: 'Bài này không ở trạng thái không chấm được.',
} as const;

export type RegradeRefusal =
  | { code: 'in_progress'; status: 409; message: string }
  | { code: 'has_score'; status: 400; message: string }
  | { code: 'submission_class'; status: 400; message: string }
  | { code: 'not_ungradable'; status: 400; message: string };

/**
 * Bài này có được chấm lại không — và nếu không thì vì sao.
 *
 * Hàm THUẦN vì thứ tự kiểm là thứ dễ hỏng nhất ở đây: bấm hai lần thì lần hai bài đã ở `ai_grading` với lớp
 * lý do là NULL; kiểm "lớp ≠ system" TRƯỚC sẽ trả "bài làm không đọc được" — một lời nói dối. Trạng thái
 * phải đi trước, rồi điểm, rồi lớp.
 */
export function regradeRefusal(row: {
  status: GradingResultStatus;
  aiTotalScore: string | null;
  ungradableClass: UngradableClass | null;
}): RegradeRefusal | null {
  if (row.status === 'ai_grading' || row.status === 'ai_graded') {
    return { code: 'in_progress', status: 409, message: REGRADE_MESSAGES.in_progress };
  }
  if (row.status !== 'flagged_for_review' || row.aiTotalScore !== null) {
    return { code: 'has_score', status: 400, message: REGRADE_MESSAGES.has_score };
  }
  if (row.ungradableClass === 'submission') {
    return { code: 'submission_class', status: 400, message: REGRADE_MESSAGES.submission_class };
  }
  if (row.ungradableClass !== 'system') {
    return { code: 'not_ungradable', status: 400, message: REGRADE_MESSAGES.not_ungradable };
  }
  return null;
}
