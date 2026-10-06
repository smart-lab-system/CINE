import { beforeEach, describe, expect, it, vi } from 'vitest';

const patch = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { PATCH: (...a: unknown[]) => patch(...a), POST: (...a: unknown[]) => post(...a), GET: vi.fn() },
}));

import { cancelExamSession, updateExamSession } from './exam-session';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const failed = (status: number, message: string) => ({ data: undefined, error: { statusCode: status, message }, response: { ok: false, status } });

describe('updateExamSession', () => {
  beforeEach(() => patch.mockReset());

  it('PATCH /exam-sessions/{id} với đúng các trường được đưa, không thêm gì', async () => {
    patch.mockResolvedValue(ok({ id: 's1', name: 'Mới' }));
    const session = await updateExamSession('s1', { name: 'Mới' });
    expect(session).toEqual({ id: 's1', name: 'Mới' });
    expect(patch).toHaveBeenCalledWith('/exam-sessions/{id}', { params: { path: { id: 's1' } }, body: { name: 'Mới' } });
  });

  it('Review Focus 6: lỗi 409 của server được ném lại nguyên câu (cửa sổ sửa đã đóng)', async () => {
    patch.mockResolvedValue(failed(409, 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.'));
    await expect(updateExamSession('s1', { name: 'x' })).rejects.toMatchObject({
      message: 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.',
    });
  });
});

describe('cancelExamSession', () => {
  beforeEach(() => post.mockReset());

  it('POST /exam-sessions/{id}/cancel với thân rỗng khi không có lý do', async () => {
    post.mockResolvedValue(ok({ id: 's1', status: 'cancelled' }));
    await cancelExamSession('s1');
    expect(post).toHaveBeenCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: {} });
  });

  it('cắt khoảng trắng của lý do; lý do toàn khoảng trắng coi như không có', async () => {
    post.mockResolvedValue(ok({ id: 's1' }));
    await cancelExamSession('s1', '  Nhầm phòng  ');
    expect(post).toHaveBeenLastCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: { reason: 'Nhầm phòng' } });
    await cancelExamSession('s1', '   ');
    expect(post).toHaveBeenLastCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: {} });
  });

  it('Review Focus 6: 409 "đã có sinh viên vào phòng" được ném lại để hộp thoại hiển thị', async () => {
    post.mockResolvedValue(failed(409, 'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc'));
    await expect(cancelExamSession('s1')).rejects.toMatchObject({ message: expect.stringContaining('Đã có sinh viên vào phòng') });
  });
});
