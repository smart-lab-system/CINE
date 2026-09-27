import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply } from '../lens-protocol';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Tính đúng" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận một LỖI đã được agent chấm chẩn đoán (rule_key), CÙNG bảng lỗi và đề bài trong',
  'workspace — nhưng KHÔNG nhận lý lẽ agent chấm đã dùng. Việc của bạn: tự gọi lại công cụ',
  '(run, run_tests, read_file, list_files) để kiểm xem lỗi đó CÓ THẬT không.',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["lens-tc-N"]}}',
  'khi đã đủ căn cứ. "refuted" nghĩa là bạn CHẠY THỬ và thấy lỗi đó không đúng như mô tả —',
  'không phải "tôi nghĩ có thể sai". toolCallIds phải là mã lens-tc-N của LƯỢT NÀY.',
].join('\n');

/**
 * "Tính đúng" (§6.1): lỗi đã chẩn đoán có thật không, chứng minh bằng một lần chạy.
 *
 * `review()` NÉM lỗi khi không kết luận được (hết bậc model, cạn ngân sách) — kiểu của
 * `Challenger.review()` chỉ cho phép `'confirmed' | 'refuted'`, nên "không kết luận được"
 * không có chỗ để trả về trực tiếp; `challenge()` (đã có, bước 2) tự bọc MỌI lỗi ném ra từ
 * `challenger.review()` thành `unverified` (§6.2, khoá bởi `challenge.spec.ts`).
 */
export class CorrectnessLens implements Challenger {
  readonly name = 'tinh_dung';
  constructor(private readonly deps: LensDeps) {}

  async review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }> {
    const userMessage = [
      `Luật bị chẩn đoán: ${input.error.ruleKey}`,
      `Mã bằng chứng gốc của agent chấm (đọc để biết công cụ nào từng chạy, KHÔNG được trích lại): ${input.error.toolCallIds.join(', ') || '(không có)'}`,
      'Hãy tự kiểm bằng công cụ của chính bạn.',
    ].join('\n');
    const r = await runLensLoop(
      input.ctx,
      SYSTEM_PROMPT,
      userMessage,
      parsePerErrorReply,
      lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null),
      this.deps,
    );
    if (!r.conclusion) throw new Error('lăng kính Tính đúng không kết luận được (hết bậc model hoặc cạn ngân sách)');
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    return { status: r.conclusion.status, toolCallIds: r.conclusion.toolCallIds.filter((id) => okIds.has(id)) };
  }
}
