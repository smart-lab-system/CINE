'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCreateClass, useUpdateClass } from '@/hooks/useTeaching';
import type { TeachingClass } from '@/lib/api/teaching';

/**
 * Tạo hoặc sửa một lớp. Một hộp thoại cho cả hai, vì hai biểu mẫu rời sẽ
 * lệch nhau ở luật hợp lệ ngay lần sửa đầu tiên.
 *
 * KHÔNG có ô chọn giảng viên. Chủ sở hữu luôn là người đang đăng nhập —
 * server lấy từ token và bỏ qua mọi `teacherId` trong body. Trưởng khoa
 * từng gán lớp cho người khác; vai trò đó không còn.
 *
 * MÔN HỌC LÀ Ô NHẬP CHỮ, không phải danh sách thả xuống. Bảng `course` đã
 * biến mất ở đợt thu hẹp master data, nên không có gì để chọn ra. Gợi ý
 * lấy từ chính các lớp giảng viên đã tạo: gõ lại đúng cách viết cũ là điều
 * duy nhất giữ cho các lớp cùng môn còn nhận ra nhau.
 */
export function ClassFormDialog({
  open,
  onOpenChange,
  editing,
  courseSuggestions,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** `null` = tạo mới. */
  editing: TeachingClass | null;
  courseSuggestions: string[];
}) {
  const create = useCreateClass();
  const update = useUpdateClass();
  const pending = create.isPending || update.isPending;

  const [courseName, setCourseName] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Nạp lại mỗi lần hộp thoại MỞ, không phải mỗi render: giữ giá trị cũ khi
  // người dùng mở lại để sửa một lớp khác là cách hiện nhầm tên lớp.
  useEffect(() => {
    if (!open) return;
    setCourseName(editing?.courseName ?? '');
    setName(editing?.name ?? '');
    setError(null);
  }, [open, editing]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { courseName: courseName.trim(), name: name.trim() };
    if (!body.courseName || !body.name) {
      setError('Nhập cả tên môn và tên lớp.');
      return;
    }

    const done = {
      onSuccess: () => {
        toast.success(editing ? 'Đã lưu thay đổi.' : `Đã tạo lớp ${body.name}.`);
        onOpenChange(false);
      },
      // Thông điệp của SERVER, không phải một câu chung chung: lỗi hay gặp
      // nhất ở đây là trùng (giảng viên, môn, tên lớp), và chỉ server mới
      // nói được là trùng với lớp nào.
      onError: (e: Error) => setError(e.message),
    };

    if (editing) {
      update.mutate({ id: editing.id, body }, done);
    } else {
      create.mutate(body, done);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa lớp' : 'Tạo lớp'}</DialogTitle>
            <DialogDescription>
              Lớp là của bạn. Danh sách sinh viên của nó quyết định ai vào được phiên thi.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FormField
            id="class-course-name"
            label="Môn học"
            hint="Gõ đúng như những lớp trước của cùng môn — hệ thống không có danh mục môn để đối chiếu."
          >
            <Input
              id="class-course-name"
              list="class-course-options"
              placeholder="CTDL&GT"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
            <datalist id="class-course-options">
              {courseSuggestions.map((course) => (
                <option key={course} value={course} />
              ))}
            </datalist>
          </FormField>

          <FormField id="class-name" label="Tên lớp">
            <Input
              id="class-name"
              placeholder="N01"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Lưu' : 'Tạo lớp'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
