import { GradingRubricCriterion } from './ai-grading-provider';
import { SYSTEM_DELIMITER_RULE, wrapSubmission } from '../harness/submission-envelope';
import { Anchor } from './anchor.types';

/**
 * Ghép context cho Grader, xếp theo BA LỚP CACHE lồng nhau.
 *
 * Cache là KHỚP TIỀN TỐ: đổi một byte ở đâu thì mọi thứ sau đó mất hiệu
 * lực. Ba breakpoint, theo thứ tự tăng dần độ riêng tư:
 *
 *   ① system     — mọi phiên, mọi giảng viên
 *   ② rubric     — mọi phiên CÙNG rubric version (rubric gắn course_id và
 *                  dùng lại giữa các phiên cùng môn — CLAUDE.md §5.6)
 *   ③ đề + đáp án — 40 bài của phiên này
 *   (sau đó)     — bài làm, phần DUY NHẤT trả giá đầy đủ
 *
 * Lý do thật của caching ở đây KHÔNG phải tiết kiệm: cả phiên 40 bài trên
 * Opus 5 tốn khoảng hai đô la. Nó làm cho việc NHÉT ĐỀ BÀI VÀ ĐÁP ÁN MẪU
 * vào context trở nên gần như miễn phí — tức biến "thêm ngữ cảnh" từ một
 * chi phí thành một thứ cho không.
 *
 * TTL để MẶC ĐỊNH (5 phút), không đặt `ttl: '1h'`: với concurrency 5 và
 * ~10-30s mỗi bài, 40 bài xong trong khoảng 4 phút, nằm gọn trong cửa sổ.
 * Chưa tra được hệ số giá của TTL 1h nên không đặt sẵn — nếu đo thấy
 * `cacheReadTokens` về 0 giữa lượt thì mới nâng, và tra giá trước.
 */

const CACHE_CONTROL = { type: 'ephemeral' as const };

/** Khối nội dung gửi đi. Giữ kiểu tối giản để file này không phụ thuộc SDK. */
export type PromptBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
      cache_control?: { type: 'ephemeral' };
    };

export interface GraderPromptInput {
  criteria: GradingRubricCriterion[];
  studentText: string;
  questionPdf?: Buffer;
  modelAnswerPdf?: Buffer;
  modelAnswerNote?: string;
  /**
   * Anchor — few-shot từ lần sửa THẬT của giảng viên (§10).
   *
   * MẶC ĐỊNH KHÔNG CÓ. Người gọi chỉ truyền khi
   * `GRADING_ANCHORS_ENABLED === 'true'`; file này không tự đọc env, để
   * `buildGraderPrompt` vẫn là một hàm thuần và test được mà không phải
   * dàn dựng biến môi trường.
   */
  anchors?: Anchor[];
}

export interface GraderPrompt {
  system: PromptBlock[];
  userContent: PromptBlock[];
  nonce: string;
  injectionSuspected: boolean;
  suspectQuote?: string;
}

/**
 * Luật chấm — lớp ①, BYTE BẤT BIẾN.
 *
 * Không được chứa bất cứ thứ gì riêng của một phiên, một rubric hay một
 * bài. Mỗi ký tự thêm vào đây là một ký tự được cache lại cho toàn hệ
 * thống; mỗi giá trị động lọt vào đây là cả ba lớp cache sập.
 */
const SYSTEM_RULES = [
  'Bạn chấm bài thi theo rubric của giảng viên.',
  '',
  'QUY TẮC TRẢ LỜI',
  '- Với MỖI tiêu chí, đưa ra verdict: met / partially_met / not_met.',
  '- Với MỖI tiêu chí, trích NGUYÊN VĂN đoạn trong bài làm chứng minh cho',
  '  verdict đó. Trích đúng từng chữ, không diễn đạt lại, không tóm tắt.',
  '- Nếu sinh viên KHÔNG hề đề cập tiêu chí đó, để trích dẫn RỖNG. Đừng bịa',
  '  một đoạn không có trong bài — dẫn chứng bịa bị phát hiện bằng máy, và',
  '  nó làm hỏng toàn bộ lượt chấm.',
  '- Liệt kê vào uncoveredContent những đoạn trong bài làm không thuộc tiêu',
  '  chí nào. Đây là chỗ để ghi nhận một em trả lời đúng theo hướng khác.',
  '',
  'KHÔNG cho điểm số. Không tính tổng. Hệ thống tự tính điểm từ verdict.',
  '',
  SYSTEM_DELIMITER_RULE,
].join('\n');

function renderRubric(criteria: GradingRubricCriterion[]): string {
  // Sắp theo `id` để thứ tự TẤT ĐỊNH. Đầu vào tới từ một câu query có
  // `order by createdAt`, nhưng dựa vào đó là dựa vào một thứ ở xa: một
  // lần đổi thứ tự sắp xếp ở tầng khác sẽ phá cache lớp ② mà không ai nối
  // được hai chuyện với nhau.
  const sorted = [...criteria].sort((a, b) => a.id.localeCompare(b.id));
  return [
    '<rubric>',
    ...sorted.map(
      (c) => `  <criterion id="${c.id}" maxPoints="${c.maxPoints}">${c.description}</criterion>`,
    ),
    '</rubric>',
  ].join('\n');
}

/**
 * Khối anchor. Trả chuỗi RỖNG khi không có — và khối rỗng đó bị
 * `.filter(Boolean)` loại hẳn, không để lại một thẻ `<anchors/>` trống.
 *
 * Vì sao quan trọng: mặc định anchor TẮT, nên đường không-anchor là đường
 * chạy của gần như mọi lượt chấm. Một thẻ rỗng thừa ở đó sẽ đổi byte của
 * lớp cache ② cho TOÀN BỘ hệ thống, đổi lấy đúng con số không.
 *
 * Đóng khung là "hai người chấm bất đồng", không phải "đáp án đúng": mục
 * tiêu là cho model thấy chuẩn của giảng viên này, chứ không phải dạy nó
 * rằng AI luôn sai.
 */
/**
 * Thoát ký tự XML cho nội dung do SINH VIÊN viết.
 *
 * `studentExcerpt` chính là `evidence` mà model đã trích NGUYÊN VĂN từ
 * bài làm — tức nó là chữ của sinh viên, và sinh viên biết bài mình sẽ
 * được AI chấm. Một em viết `</excerpt></correction></teacher_corrections>`
 * vào bài, được trích lại, rồi lần duyệt đó thành anchor, sẽ phá khung
 * XML của khối cache ② cho MỌI bài còn lại của phiên.
 *
 * VÌ SAO THOÁT CHỨ KHÔNG BỌC NONCE như `wrapSubmission`:
 *
 * 1. Nonce đổi theo từng lượt, mà khối này nằm trong LỚP CACHE ②. Đặt một
 *    giá trị đổi-mỗi-lần vào đó là sập cache — đúng bài học T-SEC-4, chỉ
 *    khác chỗ đặt. Nonce là công cụ SAI cho một khối được cache.
 * 2. Nguyên tắc "không lọc bài làm" (T-SEC-2) tồn tại vì guard verbatim
 *    đối chiếu vào văn bản gốc: sửa bài làm là phá phép kiểm đó. Anchor
 *    thì KHÔNG bị `verifyEvidence` đối chiếu — nó là ngữ cảnh few-shot,
 *    chỉ để model đọc. Nên thoát ký tự ở đây không phá thứ gì.
 *
 * Hai lý do trên là lý do cùng một vấn đề có hai lời giải khác nhau ở hai
 * chỗ khác nhau, chứ không phải một chỗ làm sai.
 */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderAnchors(anchors: Anchor[] | undefined): string {
  if (!anchors || anchors.length === 0) {
    return '';
  }
  return [
    '<teacher_corrections>',
    'Những lần giảng viên này SỬA phán đoán của hệ thống ở chính rubric trên.',
    'Dùng chúng để hiểu chuẩn chấm của thầy/cô, KHÔNG phải để kết luận rằng',
    'mọi phán đoán của hệ thống đều sai.',
    ...anchors.map((a) =>
      [
        `  <correction criterion="${escapeXml(a.criterionId)}">`,
        `    <excerpt>${escapeXml(a.studentExcerpt)}</excerpt>`,
        `    <system_said>${escapeXml(a.aiVerdict)}</system_said>`,
        `    <teacher_said>${escapeXml(a.teacherVerdict)}</teacher_said>`,
        '  </correction>',
      ].join('\n'),
    ),
    '</teacher_corrections>',
  ].join('\n');
}

export function buildGraderPrompt(input: GraderPromptInput): GraderPrompt {
  const envelope = wrapSubmission(input.studentText);

  const userContent: PromptBlock[] = [];

  // ② rubric (+ anchor) — dùng lại cho mọi phiên cùng rubric version.
  //
  // Anchor nằm TRONG CÙNG khối với rubric, không phải một breakpoint
  // riêng. Hai lý do:
  //
  // 1. Ngân sách breakpoint là 4, và system + rubric + đề/đáp án +
  //    (anchor) đã chạm trần. Một breakpoint nữa không còn chỗ.
  // 2. Anchor khoá theo `rubric_id_version` — CÙNG vòng đời với rubric.
  //    Hai thứ đổi cùng lúc thì tách breakpoint không mua được gì.
  //
  // Đánh đổi phải nói ra: tập anchor được ĐÓNG BĂNG THEO PHIÊN (A3), nên
  // hai phiên cùng rubric mà bấm chấm ở hai thời điểm khác nhau sẽ có hai
  // khối ② khác nhau và KHÔNG dùng chung được cache lớp này. Chấp nhận
  // được — cache lớp ② chỉ hữu ích khi hai phiên cùng môn được chấm cách
  // nhau dưới 5 phút, và đó là ca hiếm.
  userContent.push({
    type: 'text',
    text: [renderRubric(input.criteria), renderAnchors(input.anchors)]
      .filter(Boolean)
      .join('\n\n'),
    cache_control: CACHE_CONTROL,
  });

  // ③ đề bài + đáp án mẫu — dùng lại cho 40 bài của phiên này.
  //
  // PDF đi bằng document block, KHÔNG trích text: `extractText` trả rỗng
  // cho PDF, và một đề thi có sơ đồ mạch điện hay công thức thì trích text
  // sẽ mất sạch phần quan trọng nhất.
  if (input.questionPdf) {
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: input.questionPdf.toString('base64'),
      },
    });
  }
  if (input.modelAnswerPdf) {
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: input.modelAnswerPdf.toString('base64'),
      },
    });
  }

  // Khối này LUÔN tồn tại, kể cả khi rỗng: nó mang breakpoint ③, và một
  // breakpoint chỉ đặt-khi-có-ghi-chú sẽ làm hai phiên giống nhau có hai
  // hình dạng prompt khác nhau.
  userContent.push({
    type: 'text',
    text: input.modelAnswerNote
      ? `<teacher_note>\n${input.modelAnswerNote}\n</teacher_note>`
      : '<teacher_note/>',
    cache_control: CACHE_CONTROL,
  });

  // Phần BIẾN THIÊN — sau mọi breakpoint. Mã định danh nằm ở đây, không
  // bao giờ ở system prompt.
  userContent.push({ type: 'text', text: envelope.wrapped });

  return {
    system: [{ type: 'text', text: SYSTEM_RULES, cache_control: CACHE_CONTROL }],
    userContent,
    nonce: envelope.nonce,
    injectionSuspected: envelope.injectionSuspected,
    suspectQuote: envelope.suspectQuote,
  };
}
