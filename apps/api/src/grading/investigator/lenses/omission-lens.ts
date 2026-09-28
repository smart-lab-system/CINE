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
  'phải lý lẽ của nó), cùng danh sách các luật BẰNG LỜI mà agent chấm CHƯA kết luận. Việc của bạn:',
  'tự gọi công cụ (đọc bài, chạy thử) rồi xét TỪNG luật trong danh sách đó xem bài có vi phạm không.',
  '',
  LENS_PROTOCOL_HELP,
  '',
  'Kết luận: {"action":"final","calls":[],"conclusion":{"rules":[{"ruleKey":"…","verdict":"violated"}],"note":"…"}}.',
  '- "rules": MỖI luật trong danh sách "CHƯA được kết luận" đúng một mục. "verdict" là "violated" (bài vi phạm,',
  '  bạn đã tự kiểm bằng công cụ), "ok" (không vi phạm) hoặc "unsure" (không kiểm được).',
  '- Không ghi luật máy kiểm hay luật đã kết luận. Vấn đề nằm ngoài bảng lỗi → chỉ nêu trong "note".',
  CASE_NOTE_RULE,
  'Một luật chỉ tính là bỏ sót khi bạn đã tự kiểm bằng ít nhất một lời gọi công cụ THÀNH CÔNG.',
].join('\n');

/** "Bỏ sót" (§6.1): có lỗi nào agent chấm không thấy mà phép dò khác lộ ra không. */
export class OmissionLens implements CaseLens {
  readonly name = 'bo_sot';
  constructor(private readonly deps: LensDeps) {}

  async review(ctx: InvestigationContext, verdict: Verdict, _toolCalls: ToolCall[]): Promise<CaseLensNote> {
    // Chỉ luật BẰNG LỜI có trong bảng và chưa được kết luận mới có thể bị bỏ sót: luật máy do
    // `diagnose()` tự áp từ run_tests.
    const concluded = new Set(verdict.errors.map((e) => e.ruleKey));
    const open = ctx.rules.filter((r) => r.checkedBy === 'model' && !concluded.has(r.ruleKey));
    if (open.length === 0) {
      return { lens: this.name, suspected: false, note: 'mọi luật bằng lời đã được agent chấm kết luận — không còn luật nào để xét bỏ sót' };
    }
    const userMessage = [
      caseLensContext(ctx, verdict, '(không có — bài được coi là đúng)'),
      `Luật bằng lời CHƯA được kết luận — xét TỪNG luật: ${open.map((r) => `${r.ruleKey} (${r.title})`).join(', ')}`,
      'Tự kiểm bằng công cụ của chính bạn, rồi trả bảng kiểm cho đủ các luật trên.',
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

    const openKeys = new Set(open.map((rule) => rule.ruleKey));
    const answered = new Set([...r.conclusion.rules.map((x) => x.ruleKey), ...r.conclusion.missedRuleKeys]);
    const violated = new Set([
      ...r.conclusion.rules.filter((x) => x.verdict === 'violated').map((x) => x.ruleKey),
      ...r.conclusion.missedRuleKeys,
    ]);
    const missed = [...openKeys].filter((k) => violated.has(k));
    const unanswered = [...openKeys].filter((k) => !answered.has(k));
    const tail = unanswered.length > 0 ? ` (chưa xét: ${unanswered.join(', ')})` : '';

    if (missed.length === 0) return { lens: this.name, suspected: false, note: clampNote(`${r.conclusion.note}${tail}`) };
    // W4 (review cuối): không có lấy một lời gọi công cụ thành công thì đó là cảm giác, không phải phát hiện.
    if (!r.toolCalls.some((t) => t.status === 'ok')) {
      return { lens: this.name, suspected: false, note: clampNote(`(chưa tự kiểm được) ${r.conclusion.note}${tail}`) };
    }
    return { lens: this.name, suspected: true, note: clampNote(`Có thể bỏ sót: ${missed.join(', ')}. ${r.conclusion.note}${tail}`) };
  }
}
