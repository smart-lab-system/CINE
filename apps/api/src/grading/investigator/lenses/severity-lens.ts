import { ChallengeInput, Challenger } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parsePerErrorReply, PER_ERROR_JSON_SCHEMA } from '../lens-protocol';
import { truncateOutput } from '../truncate';
import { CHALLENGER_FRAME, LENS_PROTOCOL_HELP } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Quá tay" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn KHÔNG thấy mức trừ bằng số của luật (bảng lỗi không lộ giá cho agent). Việc của bạn:',
  'đọc mô tả luật trong bang-loi.md và bằng chứng agent chấm đã trích (đưa kèm dưới đây), rồi tự',
  'hỏi — bằng chứng đó có thực sự khớp NGHIÊM TÚC với những gì luật mô tả, hay chỉ là một kỹ thuật',
  'nhỏ, biên, không đáng bị gán cho một luật nặng như vậy? "refuted" nghĩa là bạn cho rằng luật bị',
  'áp QUÁ TAY so với bằng chứng thật — không phải "tôi thấy lỗi này nhẹ".',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"status":"confirmed"|"refuted","toolCallIds":["qua_tay-tc-N"]}}.',
  'Một kết luận "refuted" không kèm ít nhất một lần run/run_tests THÀNH CÔNG của chính bạn sẽ bị',
  'hệ thống bỏ qua, dù bạn viết gì trong toolCallIds.',
].join('\n');

/** Bằng chứng gốc mà agent chấm đã trích — sửa sau review cuối (finding C3): bản đầu chỉ đưa mã
 *  tc-N, không đưa NỘI DUNG, nên lăng kính này không thể đánh giá mức độ của một thứ nó chưa
 *  từng thấy. Cắt bằng `truncateOutput` (giữ CẢ đầu lẫn đuôi) — sửa sau review cuối (finding
 *  W-A): `.slice(0, N)` chỉ giữ đầu, có thể cắt mất dòng END của phong bì nộp bài
 *  (`SYSTEM_DELIMITER_RULE`), khiến phần sau đó lẫn vào như thể vẫn còn là dữ liệu bài nộp. */
function renderEvidence(evidence: ChallengeInput['evidence']): string {
  if (evidence.length === 0) return '(không có bằng chứng gốc nào được trích)';
  return evidence.map((t) => `[${t.id}] ${t.tool} → ${t.status}\n${truncateOutput(t.output, 2000)}`).join('\n\n');
}

/** "Quá tay" (§6.1): mức trừ đã áp có nặng hơn bằng chứng thật sự cho phép không — đo bằng
 *  LỜI (mô tả luật), không bằng SỐ (deductionHundredths không lộ cho model, §2.1). */
export class SeverityLens implements Challenger {
  readonly name = 'qua_tay';
  constructor(private readonly deps: LensDeps) {}

  async review(input: ChallengeInput): Promise<{ status: 'confirmed' | 'refuted'; toolCallIds: string[] }> {
    const userMessage = [
      `Luật bị chẩn đoán: ${input.error.ruleKey}`,
      'Bằng chứng gốc agent chấm đã trích:',
      renderEvidence(input.evidence),
      '',
      'Đọc bang-loi.md để biết mô tả luật, rồi tự kiểm thêm bằng công cụ của chính bạn nếu cần.',
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
    if (!r.conclusion) throw new Error('lăng kính Quá tay không kết luận được (hết bậc model hoặc cạn ngân sách)');
    const okIds = new Set(r.toolCalls.filter((t) => t.status === 'ok').map((t) => t.id));
    const toolCallIds = r.conclusion.toolCallIds.filter((id) => okIds.has(id));
    if (r.conclusion.status === 'refuted') {
      const ranSomething = r.toolCalls.some((t) => t.status === 'ok' && (t.tool === 'run' || t.tool === 'run_tests'));
      if (!ranSomething) {
        throw new Error('lăng kính Quá tay kết luận "refuted" mà không tự chạy thử lần nào — không được tin (§6)');
      }
    }
    return { status: r.conclusion.status, toolCallIds };
  }
}
