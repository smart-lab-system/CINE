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
 * KHÔNG có ô môn học. Hệ thống phục vụ đúng MỘT môn, nên tên môn là hằng số
 * server tự điền. Bản trước có ô nhập chữ kèm gợi ý, và đó là tổ hợp tệ
 * nhất có thể: một câu hỏi chỉ có đúng một đáp án, không được kiểm, mà trả
 * lời lệch một ký tự thì lớp này rơi khỏi mọi phép tra "cùng môn" — hỏng
 * đầu tiên là đường định tuyến bài thi bù, và hỏng trong im lặng.
 */
export function ClassFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** `null` = tạo mới. */
  editing: TeachingClass | null;
}) {
  const create = useCreateClass();
  const update = useUpdateClass();
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Nạp lại mỗi lần hộp thoại MỞ, không phải mỗi render: giữ giá trị cũ khi
  // người dùng mở lại để sửa một lớp khác là cách hiện nhầm tên lớp.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setError(null);
  }, [open, editing]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { name: name.trim() };
    if (!body.name) {
      setError('Nhập tên lớp.');
      return;
    }

    const done = {
      onSuccess: () => {
        toast.success(editing ? 'Đã lưu thay đổi.' : `Đã tạo lớp ${body.name}.`);
        onOpenChange(false);
      },
      // Thông điệp của SERVER nguyên văn. Lỗi hay gặp nhất ở đây là trùng
      // tên lớp với một lớp khác của chính mình (khoá duy nhất theo giảng
      // viên + tên), và hôm nay server chỉ trả một câu 409 chung chung —
      // hiện nguyên văn vẫn hơn là bịa ra một câu đoán sai nguyên nhân.
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
