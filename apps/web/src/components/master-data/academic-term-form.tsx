'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const academicTermFormSchema = z
  .object({
    code: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
    name: z.string().min(1).max(150),
    startsOn: z.string().min(1, 'Chọn ngày bắt đầu'),
    endsOn: z.string().min(1, 'Chọn ngày kết thúc'),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endsOn'],
  });

export type AcademicTermFormValues = z.infer<typeof academicTermFormSchema>;

export function AcademicTermForm({
  onSubmit,
}: {
  onSubmit: (values: AcademicTermFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcademicTermFormValues>({ resolver: zodResolver(academicTermFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-code">Mã học kỳ</Label>
        <Input id="term-code" {...register('code')} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-name">Tên học kỳ</Label>
        <Input id="term-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-starts-on">Ngày bắt đầu</Label>
        <Input id="term-starts-on" type="date" {...register('startsOn')} />
        {errors.startsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.startsOn.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-ends-on">Ngày kết thúc</Label>
        <Input id="term-ends-on" type="date" {...register('endsOn')} />
        {errors.endsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.endsOn.message}
          </p>
        )}
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
