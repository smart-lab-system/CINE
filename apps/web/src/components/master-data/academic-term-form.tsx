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
  startsOn: z.string().min(1),
  endsOn: z.string().min(1),
  isActive: z.boolean().default(true),
});

export type AcademicTermFormValues = z.infer<typeof schema>;

export function AcademicTermForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
}: {
  onSubmit: (values: AcademicTermFormValues) => void;
  defaultValues?: Partial<AcademicTermFormValues>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcademicTermFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      startsOn: defaultValues?.startsOn ?? '',
      endsOn: defaultValues?.endsOn ?? '',
      isActive: defaultValues?.isActive ?? true,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-code">Mã học kỳ</Label>
        <Input
          id="term-code"
          {...register('code')}
          disabled={Boolean(defaultValues?.code)}
        />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            Mã học kỳ không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-name">Tên học kỳ</Label>
        <Input id="term-name" {...register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-starts">Ngày bắt đầu</Label>
        <Input id="term-starts" type="date" {...register('startsOn')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-ends">Ngày kết thúc</Label>
        <Input id="term-ends" type="date" {...register('endsOn')} />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="term-active"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register('isActive')}
        />
        <Label htmlFor="term-active" className="font-normal">
          Đang hoạt động
        </Label>
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
