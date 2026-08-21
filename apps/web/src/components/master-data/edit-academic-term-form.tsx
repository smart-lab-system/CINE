'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editAcademicTermFormSchema = z
  .object({
    name: z.string().min(1).max(150),
    startsOn: z.string().min(1, 'Chọn ngày bắt đầu'),
    endsOn: z.string().min(1, 'Chọn ngày kết thúc'),
    isActive: z.boolean(),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endsOn'],
  });

export type EditAcademicTermFormValues = z.infer<typeof editAcademicTermFormSchema>;

export function EditAcademicTermForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditAcademicTermFormValues;
  onSubmit: (values: EditAcademicTermFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditAcademicTermFormValues>({
    resolver: zodResolver(editAcademicTermFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-name">Tên học kỳ</Label>
        <Input id="edit-term-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-starts-on">Ngày bắt đầu</Label>
        <Input id="edit-term-starts-on" type="date" {...register('startsOn')} />
        {errors.startsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.startsOn.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-ends-on">Ngày kết thúc</Label>
        <Input id="edit-term-ends-on" type="date" {...register('endsOn')} />
        {errors.endsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.endsOn.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id="edit-term-is-active"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register('isActive')}
        />
        <Label htmlFor="edit-term-is-active" className="font-normal">
          Đang mở
        </Label>
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
