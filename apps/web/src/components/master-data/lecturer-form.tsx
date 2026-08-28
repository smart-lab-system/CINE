'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  employeeCode: z.string().regex(/^[A-Za-z0-9._-]{2,32}$/),
  fullName: z.string().min(1).max(150),
  department: z.string().max(150).optional(),
  academicTitle: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^[+]?[0-9 ()-]{8,20}$/)
    .optional()
    .or(z.literal('')),
});

export type LecturerFormValues = {
  employeeCode: string;
  fullName: string;
  department?: string;
  academicTitle?: string;
  email?: string;
  phone?: string;
};

export function LecturerForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
}: {
  onSubmit: (values: LecturerFormValues) => void;
  defaultValues?: Partial<LecturerFormValues>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeCode: defaultValues?.employeeCode ?? '',
      fullName: defaultValues?.fullName ?? '',
      department: defaultValues?.department ?? '',
      academicTitle: defaultValues?.academicTitle ?? '',
      email: defaultValues?.email ?? '',
      phone: defaultValues?.phone ?? '',
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          employeeCode: values.employeeCode,
          fullName: values.fullName,
          department: values.department || undefined,
          academicTitle: values.academicTitle || undefined,
          email: values.email || undefined,
          phone: values.phone || undefined,
        }),
      )}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-code">Mã giảng viên</Label>
        <Input
          id="lecturer-code"
          {...register('employeeCode')}
          disabled={Boolean(defaultValues?.employeeCode)}
        />
        {errors.employeeCode && (
          <p role="alert" className="text-sm text-destructive">
            Mã giảng viên không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-name">Họ tên</Label>
        <Input id="lecturer-name" {...register('fullName')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-email">Email</Label>
        <Input id="lecturer-email" type="email" {...register('email')} />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            Email không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-phone">Số điện thoại</Label>
        <Input id="lecturer-phone" {...register('phone')} />
        {errors.phone && (
          <p role="alert" className="text-sm text-destructive">
            Số điện thoại không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-dept">Khoa/bộ môn</Label>
        <Input id="lecturer-dept" {...register('department')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-title">Học hàm/học vị</Label>
        <Input id="lecturer-title" {...register('academicTitle')} />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
