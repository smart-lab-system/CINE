'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Same empty-string -> undefined preprocessing as `credits` in Task 8's
// Subject forms, for the same reason: z.coerce.number() alone turns '' into
// 0 on an intentionally-blank optional field.
const cohortYearSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(1900).max(2200).optional(),
);

const studentFormSchema = z.object({
  studentCode: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  fullName: z.string().min(1).max(150),
  dateOfBirth: z.string().optional(),
  classCode: z.string().max(50).optional(),
  cohortYear: cohortYearSchema,
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export function StudentForm({
  onSubmit,
}: {
  onSubmit: (values: StudentFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentFormValues>({ resolver: zodResolver(studentFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-code">Mã số sinh viên</Label>
        <Input id="student-code" {...register('studentCode')} />
        {errors.studentCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.studentCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-full-name">Họ tên</Label>
        <Input id="student-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-date-of-birth">Ngày sinh</Label>
        <Input id="student-date-of-birth" type="date" {...register('dateOfBirth')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-class-code">Lớp</Label>
        <Input id="student-class-code" {...register('classCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-cohort-year">Năm nhập học</Label>
        <Input id="student-cohort-year" type="number" {...register('cohortYear')} />
        {errors.cohortYear && (
          <p role="alert" className="text-sm text-destructive">
            {errors.cohortYear.message}
          </p>
        )}
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
