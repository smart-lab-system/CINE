import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { CASE_LENS_JSON_SCHEMA, lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CHALLENGER_FRAME, LENS_PROTOCOL_HELP } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Gian lận" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Việc của bạn: dùng run(input) với những input KHÁC bộ test đã cho (§6 ràng buộc 2 — bạn',
  'được tự chọn input của riêng mình) để kiểm xem chương trình có thực sự GIẢI ĐÚNG bài toán,',
  'hay chỉ khớp vì hard-code theo đúng input/output của bộ test, hay dò output cố định bất kể',
  'đầu vào. Một chương trình đúng phải cho kết quả khác nhau với input khác nhau một cách hợp lý.',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}.',
  'suspected=true CHỈ khi bạn đã TỰ CHẠY run() với input tự chọn và thấy bằng chứng cụ thể của',
  'việc hard-code. Một kết luận suspected=true không kèm ít nhất một lần run() THÀNH CÔNG của',
  'chính bạn sẽ bị hệ thống hạ về false — đây là buộc tội gian lận, không được phép là cảm giác.',
].join('\n');

/** "Gian lận" (§6.1): kết quả đúng có đến từ hard-code hay dò theo bộ test không. */
export class CheatingLens implements CaseLens {
  readonly name = 'gian_lan';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    const userMessage = [
      `Lỗi agent chấm đã kết luận: ${verdict.errors.map((e) => e.ruleKey).join(', ') || '(không có — bài được coi là đúng mọi test)'}`,
      'Tự chọn input riêng (khác goi-test.md) và gọi run() để kiểm gian lận.',
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
    if (!r.conclusion) return { lens: this.name, suspected: false, note: 'không kết luận được (hết bậc model hoặc cạn ngân sách)' };
    // W4 (review cuối): buộc tội gian lận mà không có lấy một lần `run()` thành công của chính
    // lăng kính này là một cáo buộc không thể kiểm chứng — hạ về false, giữ ghi chú lại.
    if (r.conclusion.suspected && !r.toolCalls.some((t) => t.status === 'ok' && t.tool === 'run')) {
      return { lens: this.name, suspected: false, note: `(chưa tự chạy được để kiểm) ${r.conclusion.note}` };
    }
    return { lens: this.name, ...r.conclusion };
  }
}
