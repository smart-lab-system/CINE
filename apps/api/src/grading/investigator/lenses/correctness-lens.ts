import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply, PER_ERROR_JSON_SCHEMA } from '../lens-protocol';
import { CHALLENGER_FRAME, LENS_PROTOCOL_HELP } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Tính đúng" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận một LỖI đã được agent chấm chẩn đoán (rule_key), CÙNG bảng lỗi và đề bài trong',
  'workspace — nhưng KHÔNG nhận lý lẽ agent chấm đã dùng. Việc của bạn: tự gọi lại công cụ',
  '(run, run_tests, read_file, list_files) để kiểm xem lỗi đó CÓ THẬT không.',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["tinh_dung-tc-N"]}}.',
  '"refuted" nghĩa là bạn CHẠY THỬ (run hoặc run_tests) và thấy lỗi đó không đúng như mô tả —',
  'không phải "tôi nghĩ có thể sai". Việc của lăng kính này LUÔN LÀ chứng minh bằng một lần chạy',
  '(§6.1) — dù kết luận "confirmed" hay "refuted", nếu không kèm ít nhất một lần run/run_tests',
  'THÀNH CÔNG của chính bạn, hệ thống sẽ bỏ qua kết luận đó, dù bạn viết gì trong toolCallIds.',
].join('\n');

/**
 * "Tính đúng" (§6.1): lỗi đã chẩn đoán có thật không, chứng minh bằng một lần chạy.
 *
 * `review()` NÉM lỗi khi không kết luận được (hết bậc model, cạn ngân sách, HAY khi "refuted"
 * không có bằng chứng chạy thật của chính lăng kính — sửa sau review cuối, finding C3: một kết
 * luận suông không được phép xoá một mức trừ thật). Kiểu của `Challenger.review()` chỉ cho phép
 * `'confirmed' | 'refuted'`, nên "không kết luận được"/"không đủ bằng chứng" không có chỗ để trả
 * về trực tiếp; `challenge()` (đã có, bước 2) tự bọc MỌI lỗi ném ra từ `challenger.review()`
 * thành `unverified` (§6.2, khoá bởi `challenge.spec.ts`).
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
      this.name,
      SYSTEM_PROMPT,
      userMessage,
      PER_ERROR_JSON_SCHEMA,
      parsePerErrorReply,
      lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null),
      this.deps,
    );
    if (!r.conclusion) throw new Error('lăng kính Tính đúng không kết luận được (hết bậc model hoặc cạn ngân sách)');
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    const toolCallIds = r.conclusion.toolCallIds.filter((id) => okIds.has(id));
    // §6.1: việc của lăng kính này LUÔN LÀ "chứng minh bằng một lần chạy" — áp cho CẢ HAI chiều
    // kết luận, không chỉ "refuted". Một "confirmed" suông (chưa tự chạy gì) cũng không được tin
    // hơn một "refuted" suông (finding W-B, review cuối).
    const ranSomething = r.toolCalls.some((t) => t.status === 'ok' && (t.tool === 'run' || t.tool === 'run_tests'));
    if (!ranSomething) {
      throw new Error(`lăng kính Tính đúng kết luận "${r.conclusion.status}" mà không tự chạy thử lần nào — không được tin (§6.1)`);
    }
    return { status: r.conclusion.status, toolCallIds };
  }
}
