import { describe, expect, it } from 'vitest';
import { editFormValuesOf, editPayload, toDatetimeLocal, type EditFormValues, type EditableSession } from './exam-session-form';

const ROOM = '22222222-2222-4222-8222-222222222222';
const OTHER_ROOM = '33333333-3333-4333-8333-333333333333';

const original: EditableSession = {
  name: 'Giữa kỳ N01',
  roomId: ROOM,
  examType: 'GK',
  startTime: new Date(2026, 9, 6, 8, 0).toISOString(),
  endTime: new Date(2026, 9, 6, 10, 0).toISOString(),
};
const same = (): EditFormValues => editFormValuesOf(original);

describe('toDatetimeLocal', () => {
  it('giờ MÁY người dùng, dạng YYYY-MM-DDTHH:mm, không giây không múi giờ', () => {
    expect(toDatetimeLocal(new Date(2026, 9, 6, 8, 5).toISOString())).toBe('2026-10-06T08:05');
    expect(toDatetimeLocal(new Date(2026, 0, 2, 23, 59).toISOString())).toBe('2026-01-02T23:59');
  });
  it('chuỗi ngày hỏng → ô trống, không ném', () => {
    expect(toDatetimeLocal('không phải ngày')).toBe('');
  });
});

describe('editFormValuesOf', () => {
  it('nạp đúng giá trị hiện có; phiên cũ chưa có phòng → roomId rỗng', () => {
    expect(same()).toEqual({ name: 'Giữa kỳ N01', roomId: ROOM, examType: 'GK', startTime: '2026-10-06T08:00', endTime: '2026-10-06T10:00' });
    expect(editFormValuesOf({ ...original, roomId: null }).roomId).toBe('');
  });
});

describe('editPayload — chỉ gửi trường ĐỔI', () => {
  it('không đổi gì → thân rỗng (giao diện không gọi API)', () => {
    expect(editPayload(original, same())).toEqual({});
  });

  it('chỉ đổi tên → chỉ có name, đã cắt khoảng trắng', () => {
    expect(editPayload(original, { ...same(), name: '  Giữa kỳ N02 ' })).toEqual({ name: 'Giữa kỳ N02' });
  });

  it('chỉ đổi phòng / chỉ đổi loại', () => {
    expect(editPayload(original, { ...same(), roomId: OTHER_ROOM })).toEqual({ roomId: OTHER_ROOM });
    expect(editPayload(original, { ...same(), examType: 'CK' })).toEqual({ examType: 'CK' });
  });

  it('chỉ đổi giờ bắt đầu → startTime là ISO của giờ máy; endTime không đi theo', () => {
    expect(editPayload(original, { ...same(), startTime: '2026-10-06T09:00' })).toEqual({ startTime: new Date(2026, 9, 6, 9, 0).toISOString() });
  });

  it('Review Focus 2: giờ cũ LẺ GIÂY mà người dùng không đụng tới thì KHÔNG bị coi là đã đổi', () => {
    const withSeconds: EditableSession = { ...original, startTime: new Date(2026, 9, 6, 8, 0, 30).toISOString() };
    expect(editPayload(withSeconds, editFormValuesOf(withSeconds))).toEqual({});
    // đổi sang phút khác thì gửi, với giây = 0
    expect(editPayload(withSeconds, { ...editFormValuesOf(withSeconds), startTime: '2026-10-06T08:01' })).toEqual({
      startTime: new Date(2026, 9, 6, 8, 1).toISOString(),
    });
  });

  it('Review Focus 3, 4: ô phòng không đổi (kể cả phòng đã ngừng hoạt động) hoặc rỗng (phiên cũ chưa có phòng) → KHÔNG gửi roomId', () => {
    expect(editPayload(original, { ...same(), name: 'Đổi tên' })).not.toHaveProperty('roomId');
    const legacy: EditableSession = { ...original, roomId: null };
    expect(editPayload(legacy, { ...editFormValuesOf(legacy), name: 'Đổi tên' })).toEqual({ name: 'Đổi tên' });
  });

  it('Review Focus 2: dù đổi mọi thứ, thân chỉ có đúng năm khoá server cho sửa', () => {
    const everything = editPayload(original, {
      name: 'Khác', roomId: OTHER_ROOM, examType: 'TK', startTime: '2026-10-07T08:00', endTime: '2026-10-07T10:00',
    });
    expect(Object.keys(everything).sort()).toEqual(['endTime', 'examType', 'name', 'roomId', 'startTime']);
  });

  it('một ô giờ hỏng không làm ném lỗi và không được gửi', () => {
    expect(() => editPayload(original, { ...same(), startTime: '' })).not.toThrow();
    expect(editPayload(original, { ...same(), startTime: '' })).toEqual({});
  });
});
