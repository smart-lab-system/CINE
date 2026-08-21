'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Empty-string -> undefined first, then coerce to number — z.coerce.number()
// alone turns '' into 0, which would silently fill in credits on an
// intentionally-blank optional field.
const creditsSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(0).max(30).optional(),
);

const subjectFormSchema = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  name: z.string().min(1).max(200),
  credits: creditsSchema,
  description: z.string().optional(),
});

export type SubjectFormValues = z.infer<typeof subjectFormSchema>;

export function SubjectForm({
  onSubmit,
}: {
  onSubmit: (values: SubjectFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubjectFormValues>({ resolver: zodResolver(subjectFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-code">Mã môn học</Label>
        <Input id="subject-code" {...register('code')} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-name">Tên môn học</Label>
        <Input id="subject-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-credits">Số tín chỉ</Label>
        <Input id="subject-credits" type="number" {...register('credits')} />
        {errors.credits && (
          <p role="alert" className="text-sm text-destructive">
            {errors.credits.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-description">Mô tả</Label>
        <Input id="subject-description" {...register('description')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
