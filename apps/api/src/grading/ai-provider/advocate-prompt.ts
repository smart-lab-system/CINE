import { PromptBlock } from './grader-prompt';
import { SYSTEM_DELIMITER_RULE, wrapSubmission } from '../harness/submission-envelope';

/**
 * Ghép context cho Advocate — lượt hỏi thứ hai, MÙ RUBRIC.
 *
 * Hai lớp cache, không phải ba:
 *
 *   ① system     — mọi phiên, mọi giảng viên (luật KHÁC Grader)
 *   ② đề + đáp án — số ít bài cần Advocate trong phiên này
 *   (sau đó)     — bài làm, phần DUY NHẤT trả giá đầy đủ
 *
 * KHÔNG có lớp rubric, và đó là toàn bộ điểm của thiết kế này (spec §2.1):
 * Advocate nhận rubric thì nó sẽ lặp lại lượt Grader với nhiều token hơn,
 * và ý kiến thứ hai không còn độc lập.
 *
 * HỆ QUẢ VỀ CACHE, phải biết trước khi đọc số đo: vì lớp ① mang luật khác
 * và lớp rubric vắng mặt, TIỀN TỐ CỦA ADVOCATE LÀ MỘT TIỀN TỐ KHÁC HẲN —
 * namespace cache riêng, ghi riêng, đọc riêng. Bài đầu tiên cần Advocate
 * trong một phiên phải TRẢ TIỀN GHI lại toàn bộ đề + đáp án. Với ~20% của
 * 40 bài thì khoản ghi đó chia cho 8 lượt, không phải 40. Bảng chi phí
 * §2.3 của spec chưa tách khoản này ra — đo rồi sửa spec, đừng đoán.
 */

const CACHE_CONTROL = { type: 'ephemeral' as const };

export interface AdvocatePromptInput {
  studentText: string;
  questionPdf?: Buffer;
  modelAnswerPdf?: Buffer;
  modelAnswerNote?: string;
}

export interface AdvocatePrompt {
  system: PromptBlock[];
  userContent: PromptBlock[];
  nonce: string;
  injectionSuspected: boolean;
  suspectQuote?: string;
}

/**
 * Luật cho Advocate — lớp ①, BYTE BẤT BIẾN.
 *
 * Đóng khung NGƯỢC với Grader có chủ ý. Grader hỏi "bài này có khớp rubric
 * không". Advocate hỏi "bỏ qua rubric, em ấy có đúng không". Hai lượt hỏi
 * cùng một câu chỉ là nhiễu đắt tiền; chỉ khi đóng khung khác nhau thì ý
 * kiến thứ hai mới độc lập thật.
 *
 * Câu "bạn không được thấy rubric, và đó là cố ý" nằm trong prompt chứ
 * không chỉ trong comment: nếu không nói, model sẽ coi việc thiếu rubric
 * là dữ liệu bị mất và tự bịa ra một bộ tiêu chí để bám vào.
 */
const SYSTEM_RULES = [
  'Bạn đọc bài làm của một sinh viên và đối chiếu với ĐỀ BÀI.',
  '',
  'Bạn KHÔNG được thấy rubric của giảng viên, và đó là CỐ Ý. Một người khác',
  'đã chấm bài này theo rubric rồi. Việc của bạn là câu hỏi còn lại: em ấy',
  'có trả lời ĐÚNG không — kể cả khi em ấy đi theo một hướng mà người ra đề',
  'không lường trước?',
  '',
  'QUY TẮC TRẢ LỜI',
  '- isCorrect: yes / partially / no — về tính ĐÚNG ĐẮN so với đề bài.',
  '- reasoning: viết cho GIẢNG VIÊN đọc. Ngắn, cụ thể, nói thẳng em ấy đúng',
  '  ở chỗ nào. Đây là lập luận bênh vực, nhưng bênh vực bằng bằng chứng.',
  '- evidence: trích NGUYÊN VĂN từ bài làm. Đúng từng chữ, không diễn đạt',
  '  lại. Dẫn chứng bịa bị phát hiện bằng máy, và một dẫn chứng bịa ở đây',
  '  nguy hiểm hơn ở lượt chấm thứ nhất: bạn đang lập luận để NÂNG điểm cho',
  '  một em, và người đọc đang mệt.',
  '- suggestedVerdicts: chỉ nêu những tiêu chí bạn cho rằng nên xem lại.',
  '  Nếu không có gì để kiến nghị, trả mảng RỖNG. Kiến nghị lấy lệ làm',
  '  loãng những kiến nghị thật.',
  '',
  'Bạn KHÔNG cho điểm và KHÔNG tính tổng. Bạn chỉ KIẾN NGHỊ — điểm cuối do',
  'giảng viên quyết, và điểm của lượt chấm thứ nhất không bị bạn đổi.',
  '',
  'Nếu em ấy làm sai thì nói sai. Bênh vực một bài sai là làm hỏng chính',
  'thứ khiến ý kiến của bạn đáng đọc.',
  '',
  SYSTEM_DELIMITER_RULE,
].join('\n');

export function buildAdvocatePrompt(input: AdvocatePromptInput): AdvocatePrompt {
  const envelope = wrapSubmission(input.studentText);

  const userContent: PromptBlock[] = [];

  // ② đề bài + đáp án mẫu. PDF đi bằng document block, KHÔNG trích text —
  // cùng lý do với Grader: một đề có sơ đồ hay công thức thì trích text
  // làm mất đúng phần quan trọng nhất.
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

  // Khối này LUÔN tồn tại, kể cả rỗng: nó mang breakpoint ②. Một
  // breakpoint chỉ-đặt-khi-có-ghi-chú làm hai phiên giống nhau có hai hình
  // dạng prompt khác nhau, và khác hình dạng là khác cache.
  userContent.push({
    type: 'text',
    text: input.modelAnswerNote
      ? `<teacher_note>\n${input.modelAnswerNote}\n</teacher_note>`
      : '<teacher_note/>',
    cache_control: CACHE_CONTROL,
  });

  // Phần BIẾN THIÊN — sau mọi breakpoint. Mã định danh nằm ở đây, không
  // bao giờ ở system prompt (T-SEC-4).
  userContent.push({ type: 'text', text: envelope.wrapped });

  return {
    system: [{ type: 'text', text: SYSTEM_RULES, cache_control: CACHE_CONTROL }],
    userContent,
    nonce: envelope.nonce,
    injectionSuspected: envelope.injectionSuspected,
    suspectQuote: envelope.suspectQuote,
  };
}
