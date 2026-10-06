import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NearDuplicateError } from './http-error';

const calls = { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() };
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...a: unknown[]) => calls.GET(...a),
    POST: (...a: unknown[]) => calls.POST(...a),
    PATCH: (...a: unknown[]) => calls.PATCH(...a),
    DELETE: (...a: unknown[]) => calls.DELETE(...a),
  },
}));

import { listTeacherOptions } from './accounts';
import {
  createAdministrativeClass,
  deleteAdministrativeClass,
  listAdministrativeClasses,
  updateAdministrativeClass,
} from './administrative-classes';
import { createAdminClass, deleteAdminClass, listAdminClasses, updateAdminClass } from './admin-classes';
import { createRoom, deleteRoom, listRooms, updateRoom } from './rooms';
import { createSemester, deleteSemester, listSemesters, updateSemester } from './semesters';
import { lookupStudent } from './students';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const noContent = () => ({ data: undefined, error: undefined, response: { ok: true, status: 204 } });
const failed = (status: number, error: unknown) => ({ data: undefined, error, response: { ok: false, status } });

describe('semesters', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('list / create / update / delete gọi đúng route và truyền nguyên thân', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 's1' }]));
    await expect(listSemesters()).resolves.toEqual([{ id: 's1' }]);
    expect(calls.GET).toHaveBeenCalledWith('/semesters');

    const body = { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' };
    calls.POST.mockResolvedValue(ok({ id: 's1' }));
    await createSemester(body);
    expect(calls.POST).toHaveBeenCalledWith('/semesters', { body });

    calls.PATCH.mockResolvedValue(ok({ id: 's1' }));
    await updateSemester('s1', { endDate: '2027-02-15' });
    expect(calls.PATCH).toHaveBeenCalledWith('/semesters/{id}', {
      params: { path: { id: 's1' } },
      body: { endDate: '2027-02-15' },
    });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteSemester('s1');
    expect(calls.DELETE).toHaveBeenCalledWith('/semesters/{id}', { params: { path: { id: 's1' } } });
  });

  it('xoá học kỳ còn lớp: câu của server tới được người dùng', async () => {
    calls.DELETE.mockResolvedValue(failed(409, { message: 'HK1 2026-2027 còn 3 lớp nên không xoá được.' }));
    await expect(deleteSemester('s1')).rejects.toThrow('HK1 2026-2027 còn 3 lớp nên không xoá được.');
  });
});

describe('rooms', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listRooms gửi ?active=true khi activeOnly, không gửi gì khi vắng', async () => {
    calls.GET.mockResolvedValue(ok([]));
    await listRooms();
    expect(calls.GET).toHaveBeenLastCalledWith('/rooms', { params: { query: {} } });
    await listRooms({ activeOnly: true });
    expect(calls.GET).toHaveBeenLastCalledWith('/rooms', { params: { query: { active: 'true' } } });
  });

  it('create/update/delete gọi đúng route; confirmSimilar đi cùng thân', async () => {
    calls.POST.mockResolvedValue(ok({ id: 'r1' }));
    await createRoom({ name: 'H303', capacity: 40, confirmSimilar: true });
    expect(calls.POST).toHaveBeenCalledWith('/rooms', { body: { name: 'H303', capacity: 40, confirmSimilar: true } });

    calls.PATCH.mockResolvedValue(ok({ id: 'r1' }));
    await updateRoom('r1', { isActive: false });
    expect(calls.PATCH).toHaveBeenCalledWith('/rooms/{id}', { params: { path: { id: 'r1' } }, body: { isActive: false } });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteRoom('r1');
    expect(calls.DELETE).toHaveBeenCalledWith('/rooms/{id}', { params: { path: { id: 'r1' } } });
  });

  it('thêm phòng gần giống: NearDuplicateError mang mục bị so', async () => {
    calls.POST.mockResolvedValue(
      failed(409, { error: 'NEAR_DUPLICATE', message: 'gần giống', similar: [{ id: 'r1', name: 'Phòng H3.03' }] }),
    );
    const error = await createRoom({ name: 'H303' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NearDuplicateError);
    expect((error as NearDuplicateError).similar).toEqual([{ id: 'r1', name: 'Phòng H3.03' }]);
  });
});

describe('administrative classes', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('đủ bốn thao tác trên /administrative-classes', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 'a1', code: 'DHKTPM18A', classCount: 2 }]));
    await expect(listAdministrativeClasses()).resolves.toEqual([{ id: 'a1', code: 'DHKTPM18A', classCount: 2 }]);
    expect(calls.GET).toHaveBeenCalledWith('/administrative-classes');

    calls.POST.mockResolvedValue(ok({ id: 'a1' }));
    await createAdministrativeClass({ code: 'DHKTPM18A' });
    expect(calls.POST).toHaveBeenCalledWith('/administrative-classes', { body: { code: 'DHKTPM18A' } });

    calls.PATCH.mockResolvedValue(ok({ id: 'a1' }));
    await updateAdministrativeClass('a1', { code: 'DHKTPM18B', confirmSimilar: true });
    expect(calls.PATCH).toHaveBeenCalledWith('/administrative-classes/{id}', {
      params: { path: { id: 'a1' } },
      body: { code: 'DHKTPM18B', confirmSimilar: true },
    });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteAdministrativeClass('a1');
    expect(calls.DELETE).toHaveBeenCalledWith('/administrative-classes/{id}', { params: { path: { id: 'a1' } } });
  });
});

describe('admin classes', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listAdminClasses chỉ gửi các bộ lọc có giá trị', async () => {
    calls.GET.mockResolvedValue(ok([]));
    await listAdminClasses({ academicYear: 2026, q: 'DHKTPM' });
    expect(calls.GET).toHaveBeenCalledWith('/classes', { params: { query: { academicYear: 2026, q: 'DHKTPM' } } });
    await listAdminClasses();
    expect(calls.GET).toHaveBeenLastCalledWith('/classes', { params: { query: {} } });
  });

  it('create/update/delete', async () => {
    const body = { semesterId: 's1', administrativeClassId: 'a1', groupName: 'Nhóm 1', teacherId: 't1' };
    calls.POST.mockResolvedValue(ok({ id: 'c1' }));
    await createAdminClass(body);
    expect(calls.POST).toHaveBeenCalledWith('/classes', { body });

    calls.PATCH.mockResolvedValue(ok({ id: 'c1' }));
    await updateAdminClass('c1', { teacherId: 't2' });
    expect(calls.PATCH).toHaveBeenCalledWith('/classes/{id}', { params: { path: { id: 'c1' } }, body: { teacherId: 't2' } });

    calls.DELETE.mockResolvedValue(noContent());
    await deleteAdminClass('c1');
    expect(calls.DELETE).toHaveBeenCalledWith('/classes/{id}', { params: { path: { id: 'c1' } } });
  });

  it('xoá lớp còn sinh viên/phiên: câu của server tới được người dùng', async () => {
    calls.DELETE.mockResolvedValue(failed(409, { message: 'Lớp DHKTPM18A còn 40 sinh viên nên không xoá được.' }));
    await expect(deleteAdminClass('c1')).rejects.toThrow('Lớp DHKTPM18A còn 40 sinh viên nên không xoá được.');
  });
});

describe('teachers và tra sinh viên', () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockReset()));

  it('listTeacherOptions đọc /accounts/teachers', async () => {
    calls.GET.mockResolvedValue(ok([{ id: 't1', name: 'GV A' }]));
    await expect(listTeacherOptions()).resolves.toEqual([{ id: 't1', name: 'GV A' }]);
    expect(calls.GET).toHaveBeenCalledWith('/accounts/teachers');
  });

  it('lookupStudent: có thì trả { mssv, fullName }; 404 thì trả null (MSSV mới), không phải lỗi', async () => {
    calls.GET.mockResolvedValueOnce(ok({ mssv: 'SV01', fullName: 'Nguyễn Văn A' }));
    await expect(lookupStudent('SV01')).resolves.toEqual({ mssv: 'SV01', fullName: 'Nguyễn Văn A' });
    expect(calls.GET).toHaveBeenCalledWith('/students/{mssv}', { params: { path: { mssv: 'SV01' } } });

    calls.GET.mockResolvedValueOnce(failed(404, { message: 'Không có sinh viên này.' }));
    await expect(lookupStudent('SV99')).resolves.toBeNull();
  });

  it('lookupStudent: 429 (giới hạn tốc độ) và lỗi khác là lỗi thật, không bị nuốt thành "MSSV mới"', async () => {
    calls.GET.mockResolvedValueOnce(failed(429, { message: 'Tra cứu quá nhanh, hãy thử lại sau ít phút.' }));
    await expect(lookupStudent('SV01')).rejects.toThrow('Tra cứu quá nhanh');
    calls.GET.mockResolvedValueOnce(failed(500, undefined));
    await expect(lookupStudent('SV01')).rejects.toThrow('HTTP 500');
  });
});
