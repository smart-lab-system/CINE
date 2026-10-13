import { CaseLens, runCaseLens } from './case-lens';
import { challenge, Challenger, StoredChallenge } from './challenge';
import { InvestigationContext, InvestigationResult, Verdict } from './types';
import { UsageByModel, UsageSink } from './usage-sink';

export interface ChallengePhaseDeps {
  /** Tính đúng / Quá tay (§6.2) — nối vào điểm. */
  challengers: readonly Challenger[];
  /** Bỏ sót / Gian lận — chỉ gắn cờ, không đổi điểm. */
  caseLenses: readonly CaseLens[];
}

export interface ChallengePhaseResult {
  challenge: StoredChallenge | null;
  /** Token của MỌI lăng kính trong lượt này, theo model. Rỗng khi không có pha phản biện. */
  usageByModel: UsageByModel;
}

/**
 * Pha phản biện của MỘT lượt chấm (§6). Chuyển nguyên văn từ `InvestigatorRunService.runChallenge`
 * sang một hàm thuần để đường chấm thật và runner eval chạy ĐÚNG MỘT đoạn mã (spec §11: eval phải
 * chạy cả phản biện, nếu không thì các số đo của nó không nói gì về hệ thống thật).
 *
 * Bốn lăng kính chạy SONG SONG; một lăng kính hỏng không làm hỏng lượt chấm (`challenge()` bọc lỗi
 * từng `Challenger` thành `unverified`, `runCaseLens()` bọc thành `suspected: false`). Lỗi của luật
 * MÁY QUYẾT không gửi cho `Challenger` (§4.1: code đã đo, không phải ý kiến để tranh luận);
 * `CaseLens` vẫn nhận verdict ĐẦY ĐỦ vì chúng đánh giá cả bài.
 *
 * Mỗi lời gọi tạo MỘT `UsageSink` riêng: các lăng kính là singleton dùng chung cho mọi job đang
 * chạy nên token không được gom vào trạng thái của chúng.
 */
export async function runChallengePhase(
  result: InvestigationResult,
  ctx: InvestigationContext,
  deps: ChallengePhaseDeps,
): Promise<ChallengePhaseResult> {
  const sink = new UsageSink();
  if (!result.verdict || deps.challengers.length === 0) return { challenge: null, usageByModel: sink.snapshot() };
  const verdict = result.verdict;
  const toolCalls = result.investigation.toolCalls;
  const machineRuleKeys = new Set(ctx.rules.filter((r) => r.checkedBy === 'machine').map((r) => r.ruleKey));
  const challengeable: Verdict = { ...verdict, errors: verdict.errors.filter((e) => !machineRuleKeys.has(e.ruleKey)) };
  const [perError, caseNotes] = await Promise.all([
    Promise.all(deps.challengers.map((c) => challenge(challengeable, ctx, toolCalls, c, sink))),
    Promise.all(deps.caseLenses.map((l) => runCaseLens(ctx, verdict, toolCalls, l, sink))),
  ]);
  return { challenge: { perError, caseNotes }, usageByModel: sink.snapshot() };
}
