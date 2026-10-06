import {
  CANCEL_HAS_PRESENCE_MESSAGE,
  cancelStatusProblem,
  editWindowProblem,
  timeProblems,
} from './exam-session-edit.rules';

const NOW = new Date('2026-10-05T08:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe('editWindowProblem', () => {
  it('active và CHƯA tới giờ bắt đầu: sửa được', () => {
    expect(editWindowProblem({ status: 'active', startTime: minutes(1) }, NOW)).toBeNull();
    expect(editWindowProblem({ status: 'active', startTime: minutes(60 * 24 * 30) }, NOW)).toBeNull();
  });

  it('đúng giờ bắt đầu thì ĐÃ hết cửa sổ (now < start là điều kiện, không phải now <= start)', () => {
    expect(editWindowProblem({ status: 'active', startTime: NOW }, NOW)).toMatch(/đã bắt đầu/i);
  });

  it('đã bắt đầu: nêu cách thoát (huỷ nếu chưa ai vào)', () => {
    const message = editWindowProblem({ status: 'active', startTime: minutes(-5) }, NOW);
    expect(message).toBe('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
  });

  it.each([
    ['collecting', /thu bài/i],
    ['completed', /kết thúc/i],
    ['cancelled', /huỷ/i],
  ])('trạng thái %s: không sửa được, câu nói đúng trạng thái', (status, pattern) => {
    expect(editWindowProblem({ status, startTime: minutes(60) }, NOW)).toMatch(pattern);
  });

  it('trạng thái lạ (draft/scheduled — không tồn tại trong dữ liệu thật) vẫn bị từ chối', () => {
    expect(editWindowProblem({ status: 'draft', startTime: minutes(60) }, NOW)).toMatch(/draft/);
  });
});

describe('timeProblems', () => {
  it('khoảng hợp lệ: không có vấn đề', () => {
    expect(timeProblems(minutes(60), minutes(120), NOW)).toEqual([]);
  });

  it('đúng 15 phút thì đủ; 14 phút thì thiếu', () => {
    expect(timeProblems(minutes(60), minutes(75), NOW)).toEqual([]);
    expect(timeProblems(minutes(60), minutes(74), NOW)).toEqual([expect.stringMatching(/15 phút/)]);
  });

  it('kết thúc không sau bắt đầu: một vấn đề (không chồng thêm "quá ngắn")', () => {
    expect(timeProblems(minutes(60), minutes(60), NOW)).toEqual([expect.stringMatching(/sau giờ bắt đầu/)]);
    expect(timeProblems(minutes(60), minutes(30), NOW)).toEqual([expect.stringMatching(/sau giờ bắt đầu/)]);
  });

  it('lùi giờ bắt đầu tối đa 30 phút: 30 thì được, 31 thì không', () => {
    expect(timeProblems(minutes(-30), minutes(60), NOW)).toEqual([]);
    expect(timeProblems(minutes(-31), minutes(60), NOW)).toEqual([expect.stringMatching(/30 phút/)]);
  });

  it('gom mọi vấn đề thay vì dừng ở vấn đề đầu', () => {
    // Lùi quá 30 phút VÀ khoảng quá ngắn.
    expect(timeProblems(minutes(-60), minutes(-50), NOW)).toHaveLength(2);
  });
});

describe('cancelStatusProblem', () => {
  it('chỉ phiên active mới huỷ được', () => {
    expect(cancelStatusProblem('active')).toBeNull();
  });

  it.each([
    ['collecting', /thu bài/i],
    ['completed', /kết thúc/i],
  ])('trạng thái %s: không huỷ được và chỉ tới Chốt bài ngay / Xác nhận kết thúc', (status, pattern) => {
    expect(cancelStatusProblem(status)).toMatch(pattern);
  });

  it('câu "đã có người vào" nêu hai nút cần bấm', () => {
    expect(CANCEL_HAS_PRESENCE_MESSAGE).toBe(
      'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc.',
    );
  });
});
