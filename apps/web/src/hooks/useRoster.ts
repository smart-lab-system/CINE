'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRosterStudent,
  importRoster,
  listRoster,
  removeRosterStudent,
  type RosterEntry,
} from '@/lib/api/roster';

/**
 * Danh sách sinh viên của một lớp.
 *
 * Bốn hook này trước nằm trong `useDepartment.ts`, cùng file với mọi thứ
 * thuộc tầng khoa — môn học, phòng, học kỳ, phân công giảng viên. Đợt thu
 * hẹp master data xoá cả tầng đó; roster thì ở lại, vì nó là thứ quyết định
 * ai vào được phiên thi. Tách ra file riêng để lần dọn sau không phải đọc
 * lại xem trong một file lẫn lộn còn sót thứ gì.
 *
 * Khoá cache theo id lớp: hai lớp không bao giờ dùng chung một mục cache —
 * trình import tính diff dựa trên thứ hàm này trả về, và một mục cũ của lớp
 * khác sẽ cho người dùng xem một diff xoá sạch cả lớp.
 */
export function useRoster(classId: string) {
  return useQuery({
    queryKey: ['roster', classId],
    queryFn: () => listRoster(classId),
  });
}

export function useImportRoster(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { students: RosterEntry[]; removeMissing: boolean }) =>
      importRoster(classId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      // Danh sách lớp hiện sĩ số từng lớp, và import là thứ duy nhất đổi nó.
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useAddRosterStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (student: RosterEntry) => addRosterStudent(classId, student),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useRemoveRosterStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentMssv: string) => removeRosterStudent(classId, studentMssv),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}
