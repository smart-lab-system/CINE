'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  canvasWidth: z.coerce.number().int().min(1).max(10000),
  canvasHeight: z.coerce.number().int().min(1).max(10000),
});

export type TemplateFormValues = {
  name: string;
  description?: string;
  canvasWidth: number;
  canvasHeight: number;
};

export function TemplateForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Tạo mẫu',
  disableDimensions = false,
}: {
  onSubmit: (values: TemplateFormValues) => void;
  defaultValues?: Partial<TemplateFormValues>;
  submitLabel?: string;
  disableDimensions?: boolean;
}) {
  const { register, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      canvasWidth: defaultValues?.canvasWidth ?? 1280,
      canvasHeight: defaultValues?.canvasHeight ?? 720,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          name: values.name,
          description: values.description?.trim() || undefined,
          canvasWidth: Number(values.canvasWidth),
          canvasHeight: Number(values.canvasHeight),
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-name">Tên mẫu</Label>
        <Input id="template-name" {...register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-desc">Mô tả</Label>
        <Input id="template-desc" {...register('description')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-w">Chiều rộng</Label>
          <Input
            id="template-w"
            type="number"
            disabled={disableDimensions}
            {...register('canvasWidth')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="template-h">Chiều cao</Label>
          <Input
            id="template-h"
            type="number"
            disabled={disableDimensions}
            {...register('canvasHeight')}
          />
        </div>
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
