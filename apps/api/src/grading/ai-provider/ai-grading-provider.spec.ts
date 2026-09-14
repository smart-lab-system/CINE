import { enforceScoring, pointsFor } from './ai-grading-provider';

/**
 * Điểm do SERVER tính, không phải provider.
 *
 * Comment trên `CriterionResult.points` tuyên bố nó "never invented" — nhưng
 * trước bộ test này không gì ép điều đó: `pointsFor()` chỉ được gọi BÊN
 * TRONG `KeywordGradingProvider`, tức mỗi provider tự nguyện tuân thủ. Một
 * model thật trả `verdict:'not_met'` kèm `points:10` là chuyện sẽ xảy ra, và
 * con số đó đi thẳng vào bảng điểm của sinh viên.
 *
 * Guard tốt nhất là xoá cơ hội sai, không phải kiểm tra sau khi sai.
 */
describe('enforceScoring', () => {
  const CRITERIA = [
    { id: 'c1', description: 'Tiêu chí 1', maxPoints: 10 },
    { id: 'c2', description: 'Tiêu chí 2', maxPoints: 6 },
  ];

  it('bỏ qua points provider trả về, tính lại từ verdict', () => {
    const out = enforceScoring(
      [
        { criterionId: 'c1', verdict: 'not_met', points: 10, evidence: '' },
        { criterionId: 'c2', verdict: 'met', points: 0, evidence: 'có' },
      ],
      CRITERIA,
    );

    expect(out.criterionResults[0].points).toBe(0); // not_met → 0, KHÔNG phải 10
    expect(out.criterionResults[1].points).toBe(6); // met → 6, KHÔNG phải 0
  });

  it('tổng cũng tính lại, không lấy của provider', () => {
    const out = enforceScoring(
      [
        { criterionId: 'c1', verdict: 'met', points: 999, evidence: 'x' },
        { criterionId: 'c2', verdict: 'partially_met', points: 999, evidence: 'y' },
      ],
      CRITERIA,
    );

    expect(out.totalScore).toBe(13); // 10 + 3
  });

  it('giữ nguyên verdict và evidence — đó là phần model ĐƯỢC quyết', () => {
    // Ranh giới: model phán đoán, code đếm. Ép điểm không được phép sửa
    // phán đoán, nếu không thì bằng chứng và điểm sẽ nói hai điều khác nhau.
    const out = enforceScoring(
      [{ criterionId: 'c1', verdict: 'partially_met', points: 0, evidence: 'trích dẫn' }],
      CRITERIA,
    );

    expect(out.criterionResults[0].verdict).toBe('partially_met');
    expect(out.criterionResults[0].evidence).toBe('trích dẫn');
  });

  it('criterionId lạ → 0 điểm, không nổ', () => {
    // Tiêu chí không thuộc rubric này không có maxPoints để mà tính. Cho 0
    // và để guard coverage (G3) báo cáo — nổ ở đây sẽ mất luôn những tiêu
    // chí hợp lệ khác trong cùng lượt chấm.
    const out = enforceScoring(
      [{ criterionId: 'không-có-thật', verdict: 'met', points: 10, evidence: 'x' }],
      CRITERIA,
    );

    expect(out.criterionResults[0].points).toBe(0);
    expect(out.totalScore).toBe(0);
  });

  it('mảng rỗng → tổng 0', () => {
    expect(enforceScoring([], CRITERIA).totalScore).toBe(0);
  });
});

describe('pointsFor', () => {
  it('met = toàn bộ, partially_met = một nửa, not_met = 0', () => {
    expect(pointsFor('met', 10)).toBe(10);
    expect(pointsFor('partially_met', 10)).toBe(5);
    expect(pointsFor('not_met', 10)).toBe(0);
  });

  it('nửa của số lẻ làm tròn tới 2 chữ số thập phân', () => {
    expect(pointsFor('partially_met', 7)).toBe(3.5);
    expect(pointsFor('partially_met', 2.5)).toBe(1.25);
  });
});
