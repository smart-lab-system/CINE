import { InvestigationContext, ToolCall, Verdict } from './types';
import { CaseLensNote } from './challenge';

/**
 * Lăng kính CẤP BÀI (§6.1: Bỏ sót, Gian lận) — không xét MỘT lỗi, xét CẢ bài. Đối xứng với
 * `Challenger` (per-error) nhưng khác hình dạng: không có ruleKey để gắn kết luận vào, nên
 * kết quả là một ghi chú + cờ nghi ngờ, KHÔNG PHẢI confirmed/refuted/unverified — hai khái
 * niệm đó chỉ có nghĩa khi có một kết luận SẴN CÓ để đối chiếu.
 */
export interface CaseLens {
  readonly name: string;
  review(ctx: InvestigationContext, verdict: Verdict, toolCalls: ToolCall[]): Promise<CaseLensNote>;
}

/**
 * Một lăng kính hỏng (model chết, JSON sai khuôn) → `suspected: false`, KHÔNG chặn lượt chấm.
 * Bất đối xứng ngược với per-error: ở đây "không đọc được" phải là AN TOÀN NHẤT — một ghi chú
 * bịa ra ("suspected: true") từ một lăng kính hỏng sẽ đẩy oan một bài đúng về giảng viên.
 */
export async function runCaseLens(
  ctx: InvestigationContext,
  verdict: Verdict,
  toolCalls: ToolCall[],
  lens: CaseLens,
): Promise<CaseLensNote> {
  try {
    return await lens.review(ctx, verdict, toolCalls);
  } catch {
    return { lens: lens.name, suspected: false, note: 'không đọc được ý kiến của lăng kính này' };
  }
}
