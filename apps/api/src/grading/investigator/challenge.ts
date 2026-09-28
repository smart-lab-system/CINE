import { InvestigationContext, ToolCall, Verdict, VerdictError } from './types';

export type ChallengeStatus = 'confirmed' | 'refuted' | 'unverified';

export interface ChallengeInput {
  /** KHÔNG có `note`: phản biện không được thấy lập luận của agent chấm (§6 ràng buộc 1). */
  error: Omit<VerdictError, 'note'>;
  ctx: InvestigationContext;
  /** Các toolCall THÔ mà lỗi trích. */
  evidence: ToolCall[];
}

export interface Challenger {
  readonly name: string;
  review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }>;
}

export interface ChallengeConclusion {
  challenger: string;
  perError: { ruleKey: string; status: ChallengeStatus; toolCallIds: string[] }[];
}

/**
 * Phản biện là khâu GHÉP BÊN NGOÀI `investigate()` (§12.5 yêu cầu 2): gọi được trên một
 * verdict TỰ DỰNG, nên eval tiêm được lỗi giả vào giữa (§12.3), và ablation `−advocate` chỉ là
 * không ghép khâu này. Bước 2 chốt RANH GIỚI; bốn lăng kính và công cụ riêng của phản biện là
 * bước 6 (Q6).
 *
 * Xét các lỗi SONG SONG (bước 6, sửa sau review cuối) — không phải tuần tự: một bài có N lỗi
 * chẩn đoán tuần tự sẽ mất N lần thời gian của MỘT lượt lăng kính (có thể ~60-90s mỗi lượt, xem
 * `LENS_BUDGET`), dễ vượt trần thời gian của cả job chấm. Song song thì trần thời gian của cả
 * hàm này bị chặn bởi lượt CHẬM NHẤT, không phải tổng của mọi lượt.
 */
export async function challenge(
  verdict: Verdict,
  ctx: InvestigationContext,
  toolCalls: ToolCall[],
  challenger: Challenger,
): Promise<ChallengeConclusion> {
  const byId = new Map(toolCalls.map((t) => [t.id, t]));
  const perError = await Promise.all(
    verdict.errors.map(async (e): Promise<ChallengeConclusion['perError'][number]> => {
      const input: ChallengeInput = {
        error: { ruleKey: e.ruleKey, toolCallIds: e.toolCallIds },
        ctx,
        evidence: e.toolCallIds.map((id) => byId.get(id)).filter((t): t is ToolCall => t !== undefined),
      };
      try {
        const r = await challenger.review(input);
        return { ruleKey: e.ruleKey, status: r.status, toolCallIds: r.toolCallIds };
      } catch {
        // Không đọc được → `unverified`, KHÔNG BAO GIỜ `refuted`: chấm nó "đã bác bỏ" là âm
        // thầm chôn một lỗi có thật (§6.2).
        return { ruleKey: e.ruleKey, status: 'unverified', toolCallIds: [] };
      }
    }),
  );
  return { challenger: challenger.name, perError };
}

/** Ghi chú của một lăng kính CẤP BÀI (Bỏ sót, Gian lận) — không gắn với một ruleKey. */
export interface CaseLensNote {
  lens: string;
  suspected: boolean;
  note: string;
}

/**
 * Toàn bộ kết quả phản biện của MỘT lượt chấm, lưu trong `StoredInvestigation.challenge`
 * (§6, bước 6) — chưa dùng cột `grading_attempt.challenge` riêng (đã có từ migration
 * `1789450000000-AttemptsBundlesScores`): gộp vào `investigation` cho đơn giản, dùng lại
 * đúng cơ chế "tolerant khi đọc bản ghi cũ" đã có ở `readStoredInvestigation()`, thay vì mở
 * thêm một đường đọc/ghi DB riêng chỉ để có một cột không dùng tới.
 */
export interface StoredChallenge {
  /** Một entry cho MỖI lăng kính per-error (Tính đúng, Quá tay) — chưa gộp theo ruleKey. */
  perError: ChallengeConclusion[];
  /** Bỏ sót, Gian lận. */
  caseNotes: CaseLensNote[];
}
