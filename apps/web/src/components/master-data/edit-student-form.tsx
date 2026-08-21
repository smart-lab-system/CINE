'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const cohortYearSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(1900).max(2200).optional(),
);

const editStudentFormSchema = z.object({
  fullName: z.string().min(1).max(150),
  dateOfBirth: z.string().optional(),
  classCode: z.string().max(50).optional(),
  cohortYear: cohortYearSchema,
});

export type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

export function EditStudentForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditStudentFormValues;
  onSubmit: (values: EditStudentFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-full-name">Họ tên</Label>
        <Input id="edit-student-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-date-of-birth">Ngày sinh</Label>
        <Input id="edit-student-date-of-birth" type="date" {...register('dateOfBirth')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-class-code">Lớp</Label>
        <Input id="edit-student-class-code" {...register('classCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-cohort-year">Năm nhập học</Label>
        <Input id="edit-student-cohort-year" type="number" {...register('cohortYear')} />
        {errors.cohortYear && (
          <p role="alert" className="text-sm text-destructive">
            {errors.cohortYear.message}
          </p>
        )}
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
