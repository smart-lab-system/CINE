'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const creditsSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(0).max(30).optional(),
);

const editSubjectFormSchema = z.object({
  name: z.string().min(1).max(200),
  credits: creditsSchema,
  description: z.string().optional(),
});

export type EditSubjectFormValues = z.infer<typeof editSubjectFormSchema>;

export function EditSubjectForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditSubjectFormValues;
  onSubmit: (values: EditSubjectFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-name">Tên môn học</Label>
        <Input id="edit-subject-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-credits">Số tín chỉ</Label>
        <Input id="edit-subject-credits" type="number" {...register('credits')} />
        {errors.credits && (
          <p role="alert" className="text-sm text-destructive">
            {errors.credits.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-description">Mô tả</Label>
        <Input id="edit-subject-description" {...register('description')} />
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
