import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { lensArgsFor, parseCaseLensReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CHALLENGER_FRAME } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Gian lận" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Việc của bạn: dùng run(input) với những input KHÁC bộ test đã cho (§6 ràng buộc 2 — bạn',
  'được tự chọn input của riêng mình) để kiểm xem chương trình có thực sự GIẢI ĐÚNG bài toán,',
  'hay chỉ khớp vì hard-code theo đúng input/output của bộ test, hay dò output cố định bất kể',
  'đầu vào. Một chương trình đúng phải cho kết quả khác nhau với input khác nhau một cách hợp lý.',
  '',
  'Trả JSON: {"action":"call","calls":[...],"conclusion":null} khi cần gọi thêm công cụ, hoặc',
  '{"action":"final","calls":[],"conclusion":{"suspected":true|false,"note":"…"}}. suspected=true',
  'CHỈ khi bạn đã TỰ CHẠY với input tự chọn và thấy bằng chứng cụ thể của việc hard-code.',
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
      ctx, SYSTEM_PROMPT, userMessage, parseCaseLensReply, lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null), this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: 'không kết luận được (hết bậc model hoặc cạn ngân sách)' };
    return { lens: this.name, ...r.conclusion };
  }
}
