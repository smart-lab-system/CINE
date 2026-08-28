'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const STUDENT_STATUSES = ['active', 'graduated'] as const;

const schema = z.object({
  studentCode: z.string().regex(/^[A-Za-z0-9._-]{3,32}$/),
  fullName: z.string().min(1).max(150),
  status: z.enum(STUDENT_STATUSES).optional(),
});

export type StudentFormValues = {
  studentCode: string;
  fullName: string;
  status?: (typeof STUDENT_STATUSES)[number];
};

export function StudentForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
}: {
  onSubmit: (values: StudentFormValues) => void;
  defaultValues?: Partial<StudentFormValues>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      studentCode: defaultValues?.studentCode ?? '',
      fullName: defaultValues?.fullName ?? '',
      status: defaultValues?.status ?? 'active',
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          studentCode: values.studentCode,
          fullName: values.fullName,
          status: values.status,
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-code">Mã sinh viên</Label>
        <Input
          id="student-code"
          {...register('studentCode')}
          disabled={Boolean(defaultValues?.studentCode)}
        />
        {errors.studentCode && (
          <p role="alert" className="text-sm text-destructive">
            Mã sinh viên không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-name">Họ tên</Label>
        <Input id="student-name" {...register('fullName')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-status">Trạng thái</Label>
        <Select id="student-status" {...register('status')}>
          <option value="active">Đang học</option>
          <option value="graduated">Tốt nghiệp</option>
        </Select>
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
