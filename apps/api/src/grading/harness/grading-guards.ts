import { CriterionVerdict } from '../ai-provider/ai-grading-provider';
import { EvidenceCheck, verifyEvidence } from './evidence-check';

/**
 * Guard tất định quanh output của model.
 *
 * `confidence` ở đây là HÀM CỦA CÁC PHÉP ĐO, không phải lời tự khai của
 * model. Model tự chấm độ tin cậy của chính nó là tín hiệu hiệu chỉnh kém
 * nhất có thể — và đặt một ngưỡng auto-approve lên con số đó là cho model
 * quyền tự kết thúc việc chấm một sinh viên dựa trên cảm giác của nó.
 *
 * Hai trong ba phép đo ở đây chạy MIỄN PHÍ trên 100% số bài, không gọi
 * model lần nào.
 *
 * CÁC CON SỐ DƯỚI ĐÂY LÀ GIÁ TRỊ KHỞI ĐẦU, phải hiệu chỉnh bằng calibration
 * (spec §11). Chúng không phải sự thật; chúng là điểm xuất phát để đo.
 */

/**
 * Bao nhiêu phần trăm tiêu chí không định vị được thì coi cả LƯỢT CHẤM là
 * không tin được.
 *
 * Một lượt trượt là NHIỄU — model đổi một dấu ngoặc, hoặc trích qua một
 * chỗ ngắt dòng lạ. Nửa số tiêu chí trượt là HỎNG. Phân biệt được hai thứ
 * đó là khác biệt giữa một guard dùng được và một guard bị tắt đi sau tuần
 * đầu vì quá ồn.
 */
const UNTRUSTWORTHY_RATIO = 0.5;

/**
 * Sàn tuyệt đối, đi kèm tỉ lệ ở trên.
 *
 * Với rubric 1-2 tiêu chí, tỉ lệ mất nghĩa: một tiêu chí trượt trên tổng
 * hai là đúng 50%, và một sai lệch chữ in nhỏ (biến thể chưa có trong
 * `TYPOGRAPHIC_FOLD`) sẽ kích hoạt chấm lại cho MỌI bài của phiên đó.
 *
 * Yêu cầu ÍT NHẤT hai tiêu chí trượt: một lượt trượt là nhiễu ở mọi cỡ
 * rubric, còn hai lượt trượt cùng lúc mới bắt đầu là một khuôn mẫu.
 */
const UNTRUSTWORTHY_MIN_COUNT = 2;

export interface GuardInput {
  /** Bài làm nguyên văn — thứ dẫn chứng phải đối chiếu vào. */
  studentText: string;
  criteria: { id: string }[];
  criterionResults: {
    criterionId: string;
    verdict: CriterionVerdict;
    evidence: string;
  }[];
}

export interface GuardOutcome {
  confidence: number;
  status: 'auto_approved' | 'flagged_for_review';
  /** Plan 2 đọc cờ này để quyết có chạy Advocate không. */
  needsAdvocate: boolean;
  /** `true` → chấm lại ĐÚNG MỘT lần rồi mới kết luận (spec §6.4). */
  runUntrustworthy: boolean;
  perCriterion: { criterionId: string; check: EvidenceCheck }[];
  /** Câu giải thích cho giảng viên đọc. `null` khi không có gì bất thường. */
  reason: string | null;
}

export function applyGuards(input: GuardInput): GuardOutcome {
  const perCriterion = input.criterionResults.map((row) => ({
    criterionId: row.criterionId,
    check: verifyEvidence(input.studentText, row.evidence),
  }));

  // G3 — phủ đủ tiêu chí, không id lạ.
  const expected = new Set(input.criteria.map((c) => c.id));
  const returned = new Set(input.criterionResults.map((r) => r.criterionId));
  const coverageBroken =
    expected.size !== returned.size || [...expected].some((id) => !returned.has(id));

  if (coverageBroken) {
    return {
      confidence: 0,
      status: 'flagged_for_review',
      needsAdvocate: false,
      runUntrustworthy: true,
      perCriterion,
      reason: 'AI không trả về đúng bộ tiêu chí của rubric — không tin được lượt chấm này.',
    };
  }

  // G2 — dẫn chứng có định vị được không.
  const unverified = perCriterion.filter((r) => r.check === 'unverified');
  if (
    unverified.length >= UNTRUSTWORTHY_MIN_COUNT &&
    unverified.length / perCriterion.length >= UNTRUSTWORTHY_RATIO
  ) {
    return {
      confidence: 0,
      status: 'flagged_for_review',
      needsAdvocate: false,
      runUntrustworthy: true,
      perCriterion,
      reason:
        `Không định vị được dẫn chứng cho ${unverified.length}/${perCriterion.length} ` +
        'tiêu chí — không tin được lượt chấm này.',
    };
  }

  // Cổng Advocate — cố ý RỘNG.
  //
  // Đọc `verdict`, một trường BẮT BUỘC trong schema mà model không thể bỏ
  // trống. KHÔNG đọc `uncoveredContent`: đó là trường tuỳ tâm, và nếu
  // Grader coi đoạn văn lệch hướng là "râu ria" rồi trả mảng rỗng thì
  // Advocate không bao giờ chạy — sinh viên mất điểm âm thầm, đúng thứ cả
  // thiết kế này sinh ra để chặn.
  //
  // Bất đối xứng chi phí quyết định hướng nghiêng: kích hoạt thừa tốn
  // ~$0,05; bỏ sót là một sinh viên mất điểm mà không ai biết.
  // Đọc lại từ `perCriterion` thay vì gọi `verifyEvidence` lần hai: hàm
  // đó thuần nên hai lời gọi cho cùng kết quả, nhưng hai nguồn cho cùng
  // một sự thật là thứ người đọc sau phải tự chứng minh là chúng không
  // thể lệch nhau.
  const needsAdvocate =
    input.criterionResults.some((row) => row.verdict === 'not_met') ||
    perCriterion.some((r) => r.check === 'empty');

  // Một tiêu chí không định vị được (dưới ngưỡng) vẫn kéo bài sang cho
  // người xem: ta không công bố một điểm số dựa trên dẫn chứng chưa kiểm
  // được, dù phần còn lại của lượt chấm vẫn dùng được.
  const someUnverified = unverified.length > 0;

  if (needsAdvocate) {
    return {
      confidence: 0.3,
      status: 'flagged_for_review',
      needsAdvocate: true,
      runUntrustworthy: false,
      perCriterion,
      reason:
        'Có tiêu chí sinh viên không đạt hoặc không đề cập — cần đối chiếu với đề bài ' +
        'xem em có trả lời đúng theo hướng khác không.',
    };
  }

  if (someUnverified) {
    return {
      confidence: 0.5,
      status: 'flagged_for_review',
      needsAdvocate: false,
      runUntrustworthy: false,
      perCriterion,
      reason: `Không định vị được dẫn chứng cho ${unverified.length} tiêu chí.`,
    };
  }

  const allMet = input.criterionResults.every((row) => row.verdict === 'met');
  return {
    confidence: allMet ? 0.95 : 0.85,
    status: 'auto_approved',
    needsAdvocate: false,
    runUntrustworthy: false,
    perCriterion,
    reason: null,
  };
}
