import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { CASE_LENS_JSON_SCHEMA, clampNote, lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CASE_NOTE_RULE, CHALLENGER_FRAME, LENS_PROTOCOL_HELP } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Bỏ sót" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận đề bài, bảng lỗi, và KẾT LUẬN CUỐI của agent chấm (danh sách lỗi nó đã tìm — không',
  'phải lý lẽ của nó). Việc của bạn: tự gọi công cụ để tìm xem có lỗi nào agent chấm KHÔNG THẤY',
  'mà bằng chứng thật sự lộ ra không — ví dụ một ca biên, một điều kiện trong đề chưa được',
  'kiểm bằng run/run_tests nào.',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}.',
  CASE_NOTE_RULE,
  'suspected=true CHỈ khi bạn đã tự chạy và thấy bằng chứng cụ thể — không phải cảm giác',
  '"có thể còn thiếu". Một kết luận suspected=true không kèm ít nhất một lời gọi công cụ THÀNH',
  'CÔNG của chính bạn sẽ bị hệ thống hạ về false.',
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
      ctx,
      this.name,
      SYSTEM_PROMPT,
      userMessage,
      CASE_LENS_JSON_SCHEMA,
      parseCaseLensReply,
      lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null),
      this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: clampNote(`không kết luận được — ${r.failure}`) };
    // W4 (review cuối): "suspected:true" không có lấy một lời gọi công cụ thành công của chính
    // lăng kính này là một cảm giác, không phải một phát hiện — hạ về false, giữ ghi chú lại để
    // giảng viên vẫn đọc được LÝ DO model đưa ra, dù không được tin.
    if (r.conclusion.suspected && !r.toolCalls.some((t) => t.status === 'ok')) {
      return { lens: this.name, suspected: false, note: clampNote(`(chưa tự kiểm được) ${r.conclusion.note}`) };
    }
    return { lens: this.name, ...r.conclusion };
  }
}
