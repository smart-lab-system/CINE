import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { GET: (...a: unknown[]) => get(...a), POST: vi.fn() } }));

import {
  listExamSessions,
  listExamSessionsInRange,
  type ExamSessionListItem,
  type SearchExamSessionsParams,
} from './exam-session';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });

describe('listExamSessions', () => {
  beforeEach(() => get.mockReset());

  it('trả items và total; KHÔNG còn semesterNames (danh sách kỳ lấy từ bảng học kỳ)', async () => {
    get.mockResolvedValue(ok({ items: [{ id: 's1', classLabel: 'DHKTPM18A – Nhóm 1' }], total: 1 }));
    const result = await listExamSessions({ page: 1, pageSize: 20 });
    expect(result).toEqual({ items: [{ id: 's1', classLabel: 'DHKTPM18A – Nhóm 1' }], total: 1 });
    expect(result).not.toHaveProperty('semesterNames');
  });

  it('truyền nguyên tham số lên query, gồm semesterId và academicYear', async () => {
    get.mockResolvedValue(ok({ items: [], total: 0 }));
    await listExamSessions({ page: 2, pageSize: 20, semesterId: 's1', academicYear: 2026, classId: 'c1' });
    expect(get).toHaveBeenCalledWith('/exam-sessions', {
      params: { query: { page: 2, pageSize: 20, semesterId: 's1', academicYear: 2026, classId: 'c1' } },
    });
  });

  it('listExamSessionsInRange là cùng endpoint với from/to', async () => {
    get.mockResolvedValue(ok({ items: [], total: 0 }));
    await listExamSessionsInRange({ page: 1, pageSize: 20, from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' });
    expect(get).toHaveBeenCalledWith('/exam-sessions', expect.objectContaining({
      params: { query: expect.objectContaining({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }) },
    }));
  });

  it('lỗi của server được ném lại', async () => {
    get.mockResolvedValue({ data: undefined, error: new Error('Không tải được'), response: { ok: false, status: 500 } });
    await expect(listExamSessions({ page: 1, pageSize: 20 })).rejects.toThrow('Không tải được');
  });
});

/**
 * HỢP ĐỒNG KIỂU — kiểm bằng `tsc --noEmit`, không phải lúc chạy vitest (vitest không kiểm kiểu, nên bốn ca ở trên xanh dù kiểu cũ còn nguyên).
 * `@ts-expect-error` đảo chiều phép kiểm: nếu `className`/`semesterName`/`semesterNames` còn tồn tại thì chính dòng chú thích là lỗi
 * ("Unused '@ts-expect-error' directive"), và nếu `classLabel`/`semesterId`/… chưa có thì literal bên dưới là lỗi.
 */
describe('hợp đồng kiểu của danh sách phiên thi (kiểm bằng tsc)', () => {
  it('dòng danh sách mang classLabel + semesterId/academicYear/term, giữ semesterName đã chụp, KHÔNG còn className', () => {
    const item: ExamSessionListItem = {
      id: 's1',
      name: 'Giữa kỳ',
      code: 'AB12CD',
      courseName: 'CTDL&GT',
      classLabel: 'DHKTPM18A – Nhóm 1',
      semesterId: null,
      academicYear: null,
      term: null,
      roomName: 'Phòng H3.03',
      semesterName: 'HK1 2026-2027',
      examType: 'GK',
      startTime: '2026-10-20T01:00:00.000Z',
      endTime: '2026-10-20T02:30:00.000Z',
      status: 'active',
    };
    // @ts-expect-error — `className` đã thành `classLabel` (nhãn gộp của view class_label)
    void item.className;
    expect(item.classLabel).toBe('DHKTPM18A – Nhóm 1');
  });

  it('tham số tìm kiếm nhận semesterId/academicYear và KHÔNG còn semesterName', () => {
    const params: SearchExamSessionsParams = { page: 1, pageSize: 20, semesterId: 's1', academicYear: 2026 };
    // @ts-expect-error — lọc theo CHỮ đã chụp bị bỏ: học kỳ lọc bằng khoá
    void params.semesterName;
    expect(params.semesterId).toBe('s1');
  });

  it('kết quả danh sách KHÔNG còn semesterNames', async () => {
    get.mockResolvedValue(ok({ items: [], total: 0 }));
    const result = await listExamSessions({ page: 1, pageSize: 20 });
    // @ts-expect-error — danh sách học kỳ đến từ GET /semesters, không còn từ phản hồi này
    void result.semesterNames;
    expect(result.total).toBe(0);
  });
});
