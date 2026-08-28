'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  code: z.string().regex(/^[A-Za-z0-9._-]{2,32}$/),
  name: z.string().min(1).max(150),
  building: z.string().max(100).optional(),
  floor: z.string().max(30).optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type LabFormValues = {
  code: string;
  name: string;
  building?: string;
  floor?: string;
  capacity: number;
  description?: string;
  isActive?: boolean;
};

export function LabForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
  codeDisabled = false,
}: {
  onSubmit: (values: LabFormValues) => void;
  defaultValues?: Partial<LabFormValues>;
  submitLabel?: string;
  codeDisabled?: boolean;
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
      building: defaultValues?.building ?? '',
      floor: defaultValues?.floor ?? '',
      capacity: defaultValues?.capacity ?? 40,
      description: defaultValues?.description ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          code: values.code,
          name: values.name,
          building: values.building || undefined,
          floor: values.floor || undefined,
          capacity: Number(values.capacity),
          description: values.description || undefined,
          isActive: values.isActive,
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lab-code">Mã phòng</Label>
        <Input id="lab-code" {...register('code')} disabled={codeDisabled} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            Mã phòng không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lab-name">Tên phòng</Label>
        <Input id="lab-name" {...register('name')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lab-building">Tòa nhà</Label>
          <Input id="lab-building" {...register('building')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lab-floor">Tầng</Label>
          <Input id="lab-floor" {...register('floor')} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lab-capacity">Sức chứa</Label>
        <Input id="lab-capacity" type="number" {...register('capacity')} />
        {errors.capacity && (
          <p role="alert" className="text-sm text-destructive">
            Sức chứa phải từ 1–500
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lab-description">Mô tả</Label>
        <Input id="lab-description" {...register('description')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} />
        Đang hoạt động
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
