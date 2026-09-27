import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply } from '../lens-protocol';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Quá tay" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn KHÔNG thấy mức trừ bằng số của luật (bảng lỗi không lộ giá cho agent). Việc của bạn:',
  'đọc mô tả luật trong bang-loi.md và bằng chứng agent chấm đã trích, rồi tự hỏi — bằng chứng',
  'đó có thực sự khớp NGHIÊM TÚC với những gì luật mô tả, hay chỉ là một kỹ thuật nhỏ, biên,',
  'không đáng bị gán cho một luật nặng như vậy? "refuted" nghĩa là bạn cho rằng luật bị áp',
  'QUÁ TAY so với bằng chứng thật — không phải "tôi thấy lỗi này nhẹ".',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["lens-tc-N"]}}',
  'khi đã đủ căn cứ.',
].join('\n');

/** "Quá tay" (§6.1): mức trừ đã áp có nặng hơn bằng chứng thật sự cho phép không — đo bằng
 *  LỜI (mô tả luật), không bằng SỐ (deductionHundredths không lộ cho model, §2.1). */
export class SeverityLens implements Challenger {
  readonly name = 'qua_tay';
  constructor(private readonly deps: LensDeps) {}

  async review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }> {
    const userMessage = [
      `Luật bị chẩn đoán: ${input.error.ruleKey}`,
      `Mã bằng chứng gốc (chỉ để biết công cụ nào từng chạy): ${input.error.toolCallIds.join(', ') || '(không có)'}`,
      'Đọc bang-loi.md để biết mô tả luật, rồi tự kiểm bằng công cụ của chính bạn.',
    ].join('\n');
    const r = await runLensLoop(
      input.ctx, SYSTEM_PROMPT, userMessage, parsePerErrorReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) throw new Error('lăng kính Quá tay không kết luận được (hết bậc model hoặc cạn ngân sách)');
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    return { status: r.conclusion.status, toolCallIds: r.conclusion.toolCallIds.filter((id) => okIds.has(id)) };
  }
}
