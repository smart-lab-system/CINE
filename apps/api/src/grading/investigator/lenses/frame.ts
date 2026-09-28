import { SYSTEM_DELIMITER_RULE } from '../../harness/submission-envelope';
import { CASE_NOTE_MAX } from '../lens-protocol';
import type { InvestigationContext, Verdict } from '../types';

/** Khung mở đầu chung cho BỐN lăng kính (§6.1) — giữ một chỗ, sửa một lần. */
export const CHALLENGER_FRAME = [
  'Bạn đang xem một bài bạn KHÔNG chấm, và không có lợi ích gì trong việc một kết luận nào đó đúng.',
  'Việc của bạn là BÁC BỎ nếu bác bỏ được — không phải chấm điểm bài này lần nữa.',
  'Một khẳng định mà lẽ ra bạn kiểm được bằng cách CHẠY THỬ mà không chạy thì không được tính là đã kiểm.',
].join(' ');

/**
 * Phần mô tả giao thức dùng chung cho cả bốn lăng kính — sửa sau review cuối (findings W1, W2):
 * bản đầu quên nhắc luật chống injection (mọi lăng kính CÓ QUYỀN xoay điểm — đúng chỗ một học
 * sinh nhắm tới nếu bài làm của họ "nói chuyện" được với model), và không mô tả đủ khuôn JSON
 * của một lời gọi công cụ — vòng điều tra chính phải mô tả đủ sáu trường vì `response_format:
 * json_schema` không được mọi route của gateway ép (đo 2026-09-25); lăng kính dùng cùng gateway
 * nên chịu cùng giới hạn, và bản đầu đã bỏ sót điều đó.
 *
 * "TRẢ NGAY, không văn xuôi" — thêm sau diễn tập 2026-09-28 đổi bậc model sang
 * occ/claude-sonnet-5 + cnb/glm-5.3: cnb/glm-5.3 nhiều lần mở đầu bằng một câu kế hoạch
 * ("I'll start by exploring the workspace...") thay vì đối tượng JSON — không có JSON nào để
 * đọc, khác hẳn lỗi thiếu khoá "conclusion" mà schema đã khoan dung được (readSingleJson/zod).
 * Chưa xác nhận được câu này có sửa hẳn hành vi đó không (chưa gọi lại được gateway thật để đo).
 */
export const LENS_PROTOCOL_HELP = [
  'Công cụ — hệ thống gán cho mỗi lời gọi một mã riêng:',
  '- list_files(): liệt kê file trong workspace.',
  '- read_file(path, fromLine, toLine): đọc một file theo khoảng dòng (null = từ đầu / tới hết).',
  '- run(input): biên dịch bài cùng driver của đề, chạy với stdin = input, trả kết cục và stdout.',
  '- run_tests(group): chạy bộ test của đề; group là tên nhóm, hoặc null để chạy tất cả.',
  '',
  'Mỗi lượt, trả NGAY đối tượng JSON làm ký tự ĐẦU TIÊN — không viết văn xuôi, không kèm lời dẫn',
  'hay giải thích kế hoạch trước JSON.',
  '- Gọi công cụ: {"action":"call","calls":[{"tool":"…","input":null,"group":null,"path":null,"fromLine":null,"toLine":null}],"conclusion":null}.',
  '  Mỗi lời gọi ghi đủ sáu trường "tool","input","group","path","fromLine","toLine" — không dùng thì null.',
  '  "tool" là một trong "list_files","read_file","run","run_tests".',
  '- Kết luận: {"action":"final","calls":[],"conclusion":{…}} — khuôn của "conclusion" nêu bên dưới.',
  '',
  SYSTEM_DELIMITER_RULE,
].join('\n');

/**
 * Hai dòng mở đầu tin nhắn cho lăng kính cấp bài. Lỗi luật máy kiểm do `diagnose()` tự áp từ kết
 * quả run_tests, không nằm trong verdict của model — thiếu dòng thứ hai, Bỏ sót "tìm ra" chính
 * những lỗi hệ thống đã trừ và gắn cờ oan (diễn tập 2026-09-28).
 */
export function caseLensContext(ctx: InvestigationContext, verdict: Verdict, whenNone: string): string {
  const machine = ctx.rules.filter((r) => r.checkedBy === 'machine');
  const machineKeys = new Set(machine.map((r) => r.ruleKey));
  const concluded = [...new Set(verdict.errors.map((e) => e.ruleKey))].filter((k) => !machineKeys.has(k));
  return [
    `Lỗi luật bằng lời agent chấm đã kết luận: ${concluded.join(', ') || whenNone}`,
    `Luật máy kiểm — hệ thống TỰ ÁP khi nhóm test tương ứng trượt, KHÔNG BAO GIỜ tính là bỏ sót: ${
      machine.map((r) => `${r.ruleKey} (${r.machineNote ?? r.title})`).join(', ') || '(không có)'
    }`,
  ].join('\n');
}

/** Chỉ cho hai lăng kính cấp bài. Gateway không ép `json_schema`, nên giới hạn phải nói bằng lời. */
export const CASE_NOTE_RULE = `"note" tối đa ${CASE_NOTE_MAX} ký tự: viết gọn, nêu bằng chứng chính (mã lời gọi, input đã thử); phần dài hơn sẽ bị cắt.`;
