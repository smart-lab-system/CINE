import { CaseLens } from '../case-lens';
import { CaseLensNote } from '../challenge';
import { LensDeps, runLensLoop } from '../lens-loop';
import { clampNote, lensArgsFor, OMISSION_JSON_SCHEMA, parseOmissionReply } from '../lens-protocol';
import { InvestigationContext, ToolCall, Verdict } from '../types';
import { CASE_NOTE_RULE, caseLensContext, CHALLENGER_FRAME, LENS_PROTOCOL_HELP } from './frame';

const SYSTEM_PROMPT = [
  'Bạn là lăng kính "Bỏ sót" của một hệ thống phản biện việc chấm bài lập trình.',
  CHALLENGER_FRAME,
  '',
  'Bạn nhận đề bài, bảng lỗi, và KẾT LUẬN CUỐI của agent chấm (danh sách lỗi nó đã tìm — không',
  'phải lý lẽ của nó). Việc của bạn: tự gọi công cụ để tìm xem bài có vi phạm một luật BẰNG LỜI',
  'nào trong bang-loi.md mà agent chấm KHÔNG kết luận không.',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"missedRuleKeys":["…"],"note":"…"}}.',
  '- "missedRuleKeys": rule_key trong bang-loi.md mà bài VI PHẠM nhưng CHƯA có trong danh sách đã kết luận. Không có → [].',
  '- KHÔNG ghi luật máy kiểm (hệ thống tự áp từ run_tests), KHÔNG ghi luật đã kết luận.',
  '- Vấn đề nằm ngoài bảng lỗi → chỉ nêu trong "note", không đưa vào missedRuleKeys.',
  CASE_NOTE_RULE,
  'Một luật chỉ tính là bỏ sót khi bạn đã tự kiểm bằng ít nhất một lời gọi công cụ THÀNH CÔNG.',
].join('\n');

/** "Bỏ sót" (§6.1): có lỗi nào agent chấm không thấy mà phép dò khác lộ ra không. */
export class OmissionLens implements CaseLens {
  readonly name = 'bo_sot';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    const userMessage = [
      caseLensContext(ctx, verdict, '(không có — bài được coi là đúng)'),
      'Tự kiểm bằng công cụ của chính bạn xem còn luật bằng lời nào agent chấm bỏ sót không.',
    ].join('\n');
    const r = await runLensLoop(
      ctx,
      this.name,
      SYSTEM_PROMPT,
      userMessage,
      OMISSION_JSON_SCHEMA,
      parseOmissionReply,
      lensArgsFor as never,
      (reply) => (reply.action === 'final' ? reply.conclusion : null),
      this.deps,
    );
    if (!r.conclusion) return { lens: this.name, suspected: false, note: clampNote(`không kết luận được — ${r.failure}`) };

    // Chỉ luật BẰNG LỜI có trong bảng và chưa được kết luận mới là bỏ sót thật.
    const concluded = new Set(verdict.errors.map((e) => e.ruleKey));
    const modelRules = new Set(ctx.rules.filter((rule) => rule.checkedBy === 'model').map((rule) => rule.ruleKey));
    const missed = [...new Set(r.conclusion.missedRuleKeys)].filter((k) => modelRules.has(k) && !concluded.has(k));
    if (missed.length === 0) return { lens: this.name, suspected: false, note: r.conclusion.note };
    // W4 (review cuối): không có lấy một lời gọi công cụ thành công thì đó là cảm giác, không phải phát hiện.
    if (!r.toolCalls.some((t) => t.status === 'ok')) {
      return { lens: this.name, suspected: false, note: clampNote(`(chưa tự kiểm được) ${r.conclusion.note}`) };
    }
    return { lens: this.name, suspected: true, note: clampNote(`Có thể bỏ sót: ${missed.join(', ')}. ${r.conclusion.note}`) };
  }
}
