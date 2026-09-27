import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Bỏ sót" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận đề bài, bảng lỗi, và KẾT LUẬN CUỐI của agent chấm (danh sách lỗi nó đã tìm — không',
  'phải lý lẽ của nó). Việc của bạn: tự gọi công cụ để tìm xem có lỗi nào agent chấm KHÔNG THẤY',
  'mà bằng chứng thật sự lộ ra không — ví dụ một ca biên, một điều kiện trong đề chưa được',
  'kiểm bằng run/run_tests nào.',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}. suspected=true',
  'CHỈ khi bạn đã tự chạy và thấy bằng chứng cụ thể — không phải cảm giác "có thể còn thiếu".',
].join('\n');

/** "Bỏ sót" (§6.1): có lỗi nào agent chấm không thấy mà phép dò khác lộ ra không. */
export class OmissionLens implements CaseLens {
  readonly name = 'bo_sot';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    const userMessage = [
      `Lỗi agent chấm đã kết luận: ${verdict.errors.map((e) => e.ruleKey).join(', ') || '(không có — bài được coi là đúng)'}`,
      'Tự kiểm bằng công cụ của chính bạn xem còn gì agent chấm bỏ sót không.',
    ].join('\n');
    const r = await runLensLoop(
      ctx, SYSTEM_PROMPT, userMessage, parseCaseLensReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: 'không kết luận được (hết bậc model hoặc cạn ngân sách)' };
    return { lens: this.name, ...r.conclusion };
  }
}
