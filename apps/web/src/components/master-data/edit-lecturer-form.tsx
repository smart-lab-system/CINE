'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editLecturerFormSchema = z.object({
  fullName: z.string().min(1).max(150),
  department: z.string().max(150).optional(),
  academicTitle: z.string().max(100).optional(),
});

export type EditLecturerFormValues = z.infer<typeof editLecturerFormSchema>;

export function EditLecturerForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditLecturerFormValues;
  onSubmit: (values: EditLecturerFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditLecturerFormValues>({
    resolver: zodResolver(editLecturerFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-full-name">Họ tên</Label>
        <Input id="edit-lecturer-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-department">Khoa / Bộ môn</Label>
        <Input id="edit-lecturer-department" {...register('department')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-academic-title">Học vị / Học hàm</Label>
        <Input id="edit-lecturer-academic-title" {...register('academicTitle')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
