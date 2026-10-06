import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const api = {
  listSemesters: vi.fn(),
  createSemester: vi.fn(),
  updateSemester: vi.fn(),
  deleteSemester: vi.fn(),
  listRooms: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
  listAdministrativeClasses: vi.fn(),
  createAdministrativeClass: vi.fn(),
  updateAdministrativeClass: vi.fn(),
  deleteAdministrativeClass: vi.fn(),
  listAdminClasses: vi.fn(),
  createAdminClass: vi.fn(),
  updateAdminClass: vi.fn(),
  deleteAdminClass: vi.fn(),
  listTeacherOptions: vi.fn(),
  lookupStudent: vi.fn(),
};
vi.mock('@/lib/api/semesters', () => ({
  listSemesters: (...a: unknown[]) => api.listSemesters(...a),
  createSemester: (...a: unknown[]) => api.createSemester(...a),
  updateSemester: (...a: unknown[]) => api.updateSemester(...a),
  deleteSemester: (...a: unknown[]) => api.deleteSemester(...a),
}));
vi.mock('@/lib/api/rooms', () => ({
  listRooms: (...a: unknown[]) => api.listRooms(...a),
  createRoom: (...a: unknown[]) => api.createRoom(...a),
  updateRoom: (...a: unknown[]) => api.updateRoom(...a),
  deleteRoom: (...a: unknown[]) => api.deleteRoom(...a),
}));
vi.mock('@/lib/api/administrative-classes', () => ({
  listAdministrativeClasses: (...a: unknown[]) => api.listAdministrativeClasses(...a),
  createAdministrativeClass: (...a: unknown[]) => api.createAdministrativeClass(...a),
  updateAdministrativeClass: (...a: unknown[]) => api.updateAdministrativeClass(...a),
  deleteAdministrativeClass: (...a: unknown[]) => api.deleteAdministrativeClass(...a),
}));
vi.mock('@/lib/api/admin-classes', () => ({
  listAdminClasses: (...a: unknown[]) => api.listAdminClasses(...a),
  createAdminClass: (...a: unknown[]) => api.createAdminClass(...a),
  updateAdminClass: (...a: unknown[]) => api.updateAdminClass(...a),
  deleteAdminClass: (...a: unknown[]) => api.deleteAdminClass(...a),
}));
vi.mock('@/lib/api/accounts', () => ({ listTeacherOptions: (...a: unknown[]) => api.listTeacherOptions(...a) }));
vi.mock('@/lib/api/students', () => ({ lookupStudent: (...a: unknown[]) => api.lookupStudent(...a) }));

import { useAdminClasses, useCreateAdminClass, useDeleteAdminClass, useUpdateAdminClass } from './useAdminClasses';
import {
  useAdministrativeClasses,
  useCreateAdministrativeClass,
  useDeleteAdministrativeClass,
  useUpdateAdministrativeClass,
} from './useAdministrativeClasses';
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from './useRooms';
import { useCreateSemester, useDeleteSemester, useSemesters, useUpdateSemester } from './useSemesters';
import { useStudentLookup } from './useStudentLookup';
import { useTeacherOptions } from './useTeacherOptions';

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(hook, { wrapper }), invalidate };
}

const roots = (invalidate: { mock: { calls: unknown[][] } }) =>
  invalidate.mock.calls.map((call) => (call[0] as { queryKey: string[] }).queryKey[0]).sort();

describe('hook đọc', () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  it('useSemesters / useAdministrativeClasses / useTeacherOptions trả dữ liệu của lớp API', async () => {
    api.listSemesters.mockResolvedValue([{ id: 's1' }]);
    api.listAdministrativeClasses.mockResolvedValue([{ id: 'a1' }]);
    api.listTeacherOptions.mockResolvedValue([{ id: 't1', name: 'GV A' }]);

    const semesters = setup(() => useSemesters());
    const codes = setup(() => useAdministrativeClasses());
    const teachers = setup(() => useTeacherOptions());

    await waitFor(() => expect(semesters.result.current.data).toEqual([{ id: 's1' }]));
    await waitFor(() => expect(codes.result.current.data).toEqual([{ id: 'a1' }]));
    await waitFor(() => expect(teachers.result.current.data).toEqual([{ id: 't1', name: 'GV A' }]));
  });

  it('useRooms truyền activeOnly; hai chế độ có hai khoá riêng (không dùng lẫn cache của nhau)', async () => {
    api.listRooms.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    renderHook(() => useRooms({ activeOnly: true }), { wrapper });
    renderHook(() => useRooms(), { wrapper });

    await waitFor(() => expect(api.listRooms).toHaveBeenCalledTimes(2));
    expect(api.listRooms).toHaveBeenCalledWith({ activeOnly: true });
  });

  it('useAdminClasses đưa bộ lọc vào khoá: đổi bộ lọc là một truy vấn mới', async () => {
    api.listAdminClasses.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    const { rerender } = renderHook(({ filters }) => useAdminClasses(filters), {
      wrapper,
      initialProps: { filters: { academicYear: 2026 } as { academicYear?: number; teacherId?: string } },
    });
    await waitFor(() => expect(api.listAdminClasses).toHaveBeenCalledWith({ academicYear: 2026 }));
    rerender({ filters: { academicYear: 2026, teacherId: 't1' } });
    await waitFor(() => expect(api.listAdminClasses).toHaveBeenCalledWith({ academicYear: 2026, teacherId: 't1' }));
  });
});

describe('hook ghi làm mới đúng khoá (Review Focus 4)', () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  interface MutationCase {
    label: string;
    hook: () => { mutateAsync: (variables: never) => Promise<unknown> };
    fn: keyof typeof api;
    input: unknown;
    refreshes: string[];
  }
  const CASES: MutationCase[] = [
    { label: 'tạo học kỳ', hook: () => useCreateSemester(), fn: 'createSemester', input: { academicYearStart: 2026 }, refreshes: ['classes', 'semesters'] },
    { label: 'sửa học kỳ', hook: () => useUpdateSemester(), fn: 'updateSemester', input: { id: 's1', body: {} }, refreshes: ['classes', 'semesters'] },
    { label: 'xoá học kỳ', hook: () => useDeleteSemester(), fn: 'deleteSemester', input: 's1', refreshes: ['classes', 'semesters'] },
    { label: 'tạo phòng', hook: () => useCreateRoom(), fn: 'createRoom', input: { name: 'A' }, refreshes: ['rooms'] },
    { label: 'sửa phòng', hook: () => useUpdateRoom(), fn: 'updateRoom', input: { id: 'r1', body: { isActive: false } }, refreshes: ['rooms'] },
    { label: 'xoá phòng', hook: () => useDeleteRoom(), fn: 'deleteRoom', input: 'r1', refreshes: ['rooms'] },
    { label: 'tạo mã lớp danh nghĩa', hook: () => useCreateAdministrativeClass(), fn: 'createAdministrativeClass', input: { code: 'ABC' }, refreshes: ['administrative-classes'] },
    // Đổi mã làm đổi NHÃN của mọi lớp dùng nó: danh sách lớp phải làm mới theo.
    { label: 'sửa mã lớp danh nghĩa', hook: () => useUpdateAdministrativeClass(), fn: 'updateAdministrativeClass', input: { id: 'a1', body: { code: 'XYZ' } }, refreshes: ['administrative-classes', 'classes'] },
    { label: 'xoá mã lớp danh nghĩa', hook: () => useDeleteAdministrativeClass(), fn: 'deleteAdministrativeClass', input: 'a1', refreshes: ['administrative-classes'] },
    { label: 'tạo lớp', hook: () => useCreateAdminClass(), fn: 'createAdminClass', input: { semesterId: 's1' }, refreshes: ['administrative-classes', 'classes'] },
    { label: 'sửa lớp', hook: () => useUpdateAdminClass(), fn: 'updateAdminClass', input: { id: 'c1', body: {} }, refreshes: ['classes'] },
    { label: 'xoá lớp', hook: () => useDeleteAdminClass(), fn: 'deleteAdminClass', input: 'c1', refreshes: ['administrative-classes', 'classes'] },
  ];

  it.each(CASES)('$label', async ({ hook, fn, input, refreshes }) => {
    api[fn].mockResolvedValue({});
    const { result, invalidate } = setup(hook);

    await act(async () => {
      await result.current.mutateAsync(input as never);
    });

    expect(roots(invalidate)).toEqual([...refreshes].sort());
  });

  it('mutation thất bại không làm mới gì và giữ lỗi của server cho trang hiện', async () => {
    api.deleteRoom.mockRejectedValue(new Error('Phòng "H3.03" đã có 4 phiên thi nên không xoá được.'));
    const { result, invalidate } = setup(() => useDeleteRoom());

    await act(async () => {
      await result.current.mutateAsync('r1').catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error?.message).toMatch(/4 phiên thi/));
  });
});

describe('useStudentLookup', () => {
  beforeEach(() => api.lookupStudent.mockReset());

  it('MSSV hợp lệ thì tra; kết quả null nghĩa là MSSV mới', async () => {
    api.lookupStudent.mockResolvedValue(null);
    const { result } = setup(() => useStudentLookup('SV20120001'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(api.lookupStudent).toHaveBeenCalledWith('SV20120001');
  });

  it.each(['', 'SV1', 'SV 2012', 'x'.repeat(21), 'SV-2012'])('MSSV không hợp lệ (%j) thì KHÔNG gọi server', (mssv) => {
    setup(() => useStudentLookup(mssv));
    expect(api.lookupStudent).not.toHaveBeenCalled();
  });

  it('cắt khoảng trắng trước khi tra', async () => {
    api.lookupStudent.mockResolvedValue({ mssv: 'SV20120001', fullName: 'A' });
    setup(() => useStudentLookup('  SV20120001 '));
    await waitFor(() => expect(api.lookupStudent).toHaveBeenCalledWith('SV20120001'));
  });
});
