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
 */
export async function challenge(
  verdict: Verdict,
  ctx: InvestigationContext,
  toolCalls: ToolCall[],
  challenger: Challenger,
): Promise<ChallengeConclusion> {
  const byId = new Map(toolCalls.map((t) => [t.id, t]));
  const perError: ChallengeConclusion['perError'] = [];
  for (const e of verdict.errors) {
    const input: ChallengeInput = {
      error: { ruleKey: e.ruleKey, toolCallIds: e.toolCallIds },
      ctx,
      evidence: e.toolCallIds.map((id) => byId.get(id)).filter((t): t is ToolCall => t !== undefined),
    };
    try {
      const r = await challenger.review(input);
      perError.push({ ruleKey: e.ruleKey, status: r.status, toolCallIds: r.toolCallIds });
    } catch {
      // Không đọc được → `unverified`, KHÔNG BAO GIỜ `refuted`: chấm nó "đã bác bỏ" là âm
      // thầm chôn một lỗi có thật (§6.2).
      perError.push({ ruleKey: e.ruleKey, status: 'unverified', toolCallIds: [] });
    }
  }
  return { challenger: challenger.name, perError };
}
