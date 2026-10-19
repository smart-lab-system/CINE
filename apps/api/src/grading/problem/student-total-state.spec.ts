import { stateOf } from './student-total.query';

/** Một hàng kết quả tối thiểu của một câu (đủ trường mà `stateOf` đọc). */
const result = (over: Partial<Parameters<typeof stateOf>[2][number]> = {}) => ({
  mssv: 'SV1',
  problem_id: 'p1',
  ordinal: 1,
  points_hundredths: 500,
  result_id: 'r1',
  status: 'ai_grading',
  pipeline: 'one_shot' as const,
  ungradable_class: null,
  ai_total_score: null,
  finalized_computation_id: null,
  review_kind: null,
  review_score: null,
  manual_score: null,
  finalized_score: null,
  latest_score: null,
  ...over,
});

describe('stateOf — trạng thái một câu của một sinh viên (review I2/M2)', () => {
  it('một bài đang chờ kiểm mẫu → auditPending, không điểm', () => {
    const s = stateOf(1, 500, [result({ status: 'audit_pending' })]);
    expect(s).toMatchObject({ status: 'pending', scoreHundredths: null, auditPending: true });
  });

  // Review M2: hai bài cho một câu là xung đột, nhưng nếu MỘT trong hai đang chờ kiểm mẫu thì vẫn phải báo
  // auditPending — nếu không, tổng hiện "tạm" thay vì "—", và giảng viên không biết có câu đang bị giữ.
  it('hai bài cho một câu, một trong hai đang chờ kiểm mẫu → vẫn auditPending (xung đột vẫn không có điểm)', () => {
    const s = stateOf(1, 500, [
      result({ result_id: 'r1', status: 'audit_pending' }),
      result({ result_id: 'r2', status: 'ai_grading' }),
    ]);
    expect(s).toMatchObject({ status: 'pending', scoreHundredths: null, auditPending: true });
  });

  it('hai bài cho một câu, không bài nào chờ kiểm mẫu → pending, không auditPending', () => {
    const s = stateOf(1, 500, [result({ result_id: 'r1' }), result({ result_id: 'r2' })]);
    expect(s).toMatchObject({ status: 'pending', scoreHundredths: null, auditPending: false });
  });
});
