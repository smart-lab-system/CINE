import { describe, expect, it } from 'vitest';
import { EDIT_STARTED_MESSAGE, cancelAvailability, editAvailability } from './exam-session-actions';

const NOW = new Date(2026, 9, 6, 9, 0).getTime(); // 09:00 06/10/2026, giờ máy
const at = (hour: number, minute = 0) => new Date(2026, 9, 6, hour, minute).toISOString();

describe('editAvailability — cửa sổ sửa (phương án A): active VÀ chưa đến giờ bắt đầu', () => {
  it('phiên active chưa bắt đầu → sửa được, kể cả khi còn đúng một phút', () => {
    expect(editAvailability({ status: 'active', startTime: at(10) }, NOW)).toEqual({ allowed: true });
    expect(editAvailability({ status: 'active', startTime: at(9, 1) }, NOW)).toEqual({ allowed: true });
  });

  it('Review Focus 5: đúng giờ bắt đầu là ĐÃ bắt đầu, và đã quá giờ thì càng — lý do là câu của server', () => {
    expect(editAvailability({ status: 'active', startTime: at(9, 0) }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
    expect(editAvailability({ status: 'active', startTime: at(8) }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
    expect(EDIT_STARTED_MESSAGE).toBe('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không sửa được.'],
    ['completed', 'Phiên đã kết thúc, không sửa được.'],
    ['cancelled', 'Phiên đã huỷ, không sửa được.'],
    ['draft', 'Phiên đang ở trạng thái “Nháp”, không sửa được.'],
  ])('trạng thái %s (giờ chưa tới cũng vậy) → không sửa được, nói đúng lý do', (status, reason) => {
    expect(editAvailability({ status, startTime: at(10) }, NOW)).toEqual({ allowed: false, reason });
  });

  it('giờ bắt đầu không đọc được → coi như ĐÃ bắt đầu: không bao giờ cho sửa một phiên có thể đang thi', () => {
    expect(editAvailability({ status: 'active', startTime: 'không phải ngày' }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
  });
});

describe('cancelAvailability — chỉ phiên active; có ai vào phòng chưa là việc của server', () => {
  it('phiên active → huỷ được (kể cả sau giờ bắt đầu: chưa ai vào thì vẫn huỷ được)', () => {
    expect(cancelAvailability({ status: 'active' })).toEqual({ allowed: true });
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không huỷ được. Hãy Xác nhận kết thúc ở phòng chờ.'],
    ['completed', 'Phiên đã kết thúc, không huỷ được.'],
    ['cancelled', 'Phiên này đã được huỷ.'],
    ['scheduled', 'Phiên đang ở trạng thái “Đã lên lịch”, không huỷ được.'],
  ])('trạng thái %s → không huỷ được, nói đúng lý do', (status, reason) => {
    expect(cancelAvailability({ status })).toEqual({ allowed: false, reason });
  });
});
