'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  name: z.string().min(1).max(150),
  canvasWidth: z.coerce.number().int().min(1).max(10000).optional(),
  canvasHeight: z.coerce.number().int().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export type LayoutFormValues = {
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  isActive?: boolean;
};

export function LayoutForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Tạo layout',
}: {
  onSubmit: (values: LayoutFormValues) => void;
  defaultValues?: Partial<LayoutFormValues>;
  submitLabel?: string;
}) {
  const { register, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      canvasWidth: defaultValues?.canvasWidth ?? 1280,
      canvasHeight: defaultValues?.canvasHeight ?? 720,
      isActive: defaultValues?.isActive ?? false,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          name: values.name,
          canvasWidth:
            values.canvasWidth === undefined
              ? undefined
              : Number(values.canvasWidth),
          canvasHeight:
            values.canvasHeight === undefined
              ? undefined
              : Number(values.canvasHeight),
          isActive: values.isActive,
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="layout-name">Tên layout</Label>
        <Input id="layout-name" {...register('name')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="layout-w">Chiều rộng canvas</Label>
          <Input id="layout-w" type="number" {...register('canvasWidth')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="layout-h">Chiều cao canvas</Label>
          <Input id="layout-h" type="number" {...register('canvasHeight')} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} />
        Kích hoạt ngay
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
