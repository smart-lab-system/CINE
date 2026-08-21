'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editCourseSectionFormSchema = z.object({
  nominalClassCode: z.string().max(50).optional(),
  name: z.string().max(200).optional(),
});

export type EditCourseSectionFormValues = z.infer<typeof editCourseSectionFormSchema>;

export function EditCourseSectionForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditCourseSectionFormValues;
  onSubmit: (values: EditCourseSectionFormValues) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit } = useForm<EditCourseSectionFormValues>({
    resolver: zodResolver(editCourseSectionFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-section-nominal-class-code">Lớp danh nghĩa</Label>
        <Input id="edit-section-nominal-class-code" {...register('nominalClassCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-section-name">Tên lớp học phần</Label>
        <Input id="edit-section-name" {...register('name')} />
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
