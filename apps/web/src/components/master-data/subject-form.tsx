'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  code: z.string().regex(/^[A-Za-z0-9._-]{2,32}$/),
  name: z.string().min(1).max(200),
  credits: z.coerce.number().int().min(0).max(30).optional().or(z.literal('')),
  description: z.string().optional(),
});

export type SubjectFormValues = {
  code: string;
  name: string;
  credits?: number;
  description?: string;
};

export function SubjectForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
}: {
  onSubmit: (values: SubjectFormValues) => void;
  defaultValues?: Partial<SubjectFormValues>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      credits: defaultValues?.credits,
      description: defaultValues?.description ?? '',
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          code: values.code,
          name: values.name,
          credits:
            values.credits === '' || values.credits === undefined
              ? undefined
              : Number(values.credits),
          description: values.description || undefined,
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-code">Mã môn</Label>
        <Input
          id="subject-code"
          {...register('code')}
          disabled={Boolean(defaultValues?.code)}
        />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            Mã môn không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-name">Tên môn</Label>
        <Input id="subject-name" {...register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-credits">Số tín chỉ</Label>
        <Input id="subject-credits" type="number" {...register('credits')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-description">Mô tả</Label>
        <Input id="subject-description" {...register('description')} />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
