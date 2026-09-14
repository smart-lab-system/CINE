import { applyGuards } from './grading-guards';

const CRITERIA = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];
const BAI = 'có đoạn một và đoạn hai, cùng với phần kết luận dài hơn mười ký tự';

/**
 * `confidence` được ĐO, không được khai.
 *
 * Bộ test này ghim ba tính chất: bán kính sát thương hẹp (một tiêu chí
 * trượt không nhấn chìm cả bài), cổng Advocate rộng (bỏ sót đắt hơn nhiều
 * so với kích hoạt thừa), và không đường nào cho model tự kết thúc việc
 * chấm bằng một con số nó tự nghĩ ra.
 */
describe('applyGuards', () => {
  it('T-G2-1: MỘT tiêu chí unverified → flagged, các tiêu chí khác GIỮ điểm', () => {
    // Bán kính sát thương là lỗi thật của bản thiết kế đầu, không phải bộ
    // so khớp: cho confidence=0 cả bài khi một dẫn chứng trượt là thứ tạo
    // ra lũ báo động giả. Một lượt trượt là nhiễu; nửa số tiêu chí trượt
    // mới là hỏng.
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [
        { criterionId: 'c1', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
        { criterionId: 'c2', verdict: 'met', evidence: 'KHÔNG CÓ TRONG BÀI ĐÂU CẢ' },
        { criterionId: 'c3', verdict: 'met', evidence: 'phần kết luận dài hơn' },
        { criterionId: 'c4', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
      ],
    });

    expect(out.runUntrustworthy).toBe(false); // 1/4 < 50%
    expect(out.status).toBe('flagged_for_review');
    expect(out.confidence).toBe(0.5);
    expect(out.perCriterion.filter((r) => r.check === 'ok')).toHaveLength(3);
  });

  it('T-G2-1b: ≥50% unverified → lượt chấm không tin được', () => {
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: CRITERIA.map((c) => ({
        criterionId: c.id,
        verdict: 'met' as const,
        evidence: 'HOÀN TOÀN BỊA RA KHÔNG CÓ TRONG BÀI',
      })),
    });

    expect(out.runUntrustworthy).toBe(true);
    expect(out.confidence).toBe(0);
    expect(out.reason).toMatch(/không tin được/i);
  });

  it('G3: thiếu tiêu chí → lượt chấm không tin được', () => {
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [
        { criterionId: 'c1', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
      ],
    });

    expect(out.runUntrustworthy).toBe(true);
    expect(out.confidence).toBe(0);
    expect(out.reason).toMatch(/bộ tiêu chí/i);
  });

  it('G3: trả về tiêu chí LẠ → cũng không tin được', () => {
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [
        ...CRITERIA.map((c) => ({
          criterionId: c.id,
          verdict: 'met' as const,
          evidence: 'đoạn một và đoạn hai',
        })),
        { criterionId: 'không-có-thật', verdict: 'met' as const, evidence: 'đoạn một và đoạn hai' },
      ],
    });

    expect(out.runUntrustworthy).toBe(true);
  });

  it('T-ADV-2: một tiêu chí not_met → needsAdvocate, KHÔNG cần uncoveredContent', () => {
    // Cổng đọc `verdict` — trường BẮT BUỘC trong schema — chứ không đọc
    // uncoveredContent, vốn là trường model có thể bỏ trống. Grader coi
    // đoạn lệch hướng là "râu ria" rồi trả mảng rỗng thì Advocate không
    // bao giờ chạy, và sinh viên mất điểm âm thầm.
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [
        { criterionId: 'c1', verdict: 'not_met', evidence: '' },
        { criterionId: 'c2', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
        { criterionId: 'c3', verdict: 'met', evidence: 'phần kết luận dài hơn' },
        { criterionId: 'c4', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
      ],
    });

    expect(out.needsAdvocate).toBe(true);
    expect(out.status).toBe('flagged_for_review');
    expect(out.runUntrustworthy).toBe(false);
  });

  it('tiêu chí có evidence RỖNG cũng kích hoạt Advocate', () => {
    // Rỗng nghĩa là em không đề cập tiêu chí này theo cách rubric mong
    // đợi — đúng ca cần người đối chiếu với đề bài.
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [
        { criterionId: 'c1', verdict: 'partially_met', evidence: '' },
        { criterionId: 'c2', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
        { criterionId: 'c3', verdict: 'met', evidence: 'phần kết luận dài hơn' },
        { criterionId: 'c4', verdict: 'met', evidence: 'đoạn một và đoạn hai' },
      ],
    });

    expect(out.needsAdvocate).toBe(true);
  });

  it('mọi verdict met, dẫn chứng đủ → auto_approved với tin cậy cao nhất', () => {
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: CRITERIA.map((c) => ({
        criterionId: c.id,
        verdict: 'met' as const,
        evidence: 'đoạn một và đoạn hai',
      })),
    });

    expect(out.status).toBe('auto_approved');
    expect(out.confidence).toBe(0.95);
    expect(out.needsAdvocate).toBe(false);
    expect(out.reason).toBeNull();
  });

  it('partially_met có dẫn chứng đủ → auto_approved nhưng tin cậy thấp hơn', () => {
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: CRITERIA.map((c) => ({
        criterionId: c.id,
        verdict: 'partially_met' as const,
        evidence: 'đoạn một và đoạn hai',
      })),
    });

    expect(out.status).toBe('auto_approved');
    expect(out.confidence).toBe(0.85);
  });

  it('coverage hỏng được kiểm TRƯỚC dẫn chứng', () => {
    // Thứ tự quan trọng: nếu model trả sai bộ tiêu chí thì việc đếm tỉ lệ
    // dẫn chứng trên bộ sai ấy không có nghĩa gì.
    const out = applyGuards({
      studentText: BAI,
      criteria: CRITERIA,
      criterionResults: [{ criterionId: 'c1', verdict: 'met', evidence: 'BỊA RA HẾT' }],
    });

    expect(out.reason).toMatch(/bộ tiêu chí/i);
  });
});
