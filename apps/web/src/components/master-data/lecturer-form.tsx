'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const lecturerFormSchema = z.object({
  employeeCode: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  fullName: z.string().min(1).max(150),
  department: z.string().max(150).optional(),
  academicTitle: z.string().max(100).optional(),
});

export type LecturerFormValues = z.infer<typeof lecturerFormSchema>;

export function LecturerForm({
  onSubmit,
}: {
  onSubmit: (values: LecturerFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LecturerFormValues>({ resolver: zodResolver(lecturerFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-employee-code">Mã giảng viên</Label>
        <Input id="lecturer-employee-code" {...register('employeeCode')} />
        {errors.employeeCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.employeeCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-full-name">Họ tên</Label>
        <Input id="lecturer-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-department">Khoa / Bộ môn</Label>
        <Input id="lecturer-department" {...register('department')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-academic-title">Học vị / Học hàm</Label>
        <Input id="lecturer-academic-title" {...register('academicTitle')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
