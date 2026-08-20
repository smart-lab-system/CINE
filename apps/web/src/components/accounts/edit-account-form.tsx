'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ROLE_OPTIONS = ['admin', 'operator', 'lecturer', 'student'] as const;
const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  admin: 'Quản trị',
  operator: 'Vận hành phòng máy',
  lecturer: 'Giảng viên',
  student: 'Sinh viên',
};
const STATUS_OPTIONS = ['pending', 'active', 'locked', 'disabled'] as const;

const editAccountFormSchema = z.object({
  displayName: z.string().min(1).max(150),
  status: z.enum(STATUS_OPTIONS),
  roleCodes: z.array(z.enum(ROLE_OPTIONS)).min(1, 'Chọn ít nhất một vai trò'),
});

export type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;

export function EditAccountForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditAccountFormValues;
  onSubmit: (values: EditAccountFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditAccountFormValues>({
    resolver: zodResolver(editAccountFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-display-name">Họ tên</Label>
        <Input id="edit-display-name" {...register('displayName')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-status">Trạng thái</Label>
        <select
          id="edit-status"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          {...register('status')}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Vai trò</legend>
        {ROLE_OPTIONS.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <input
              id={`edit-role-${role}`}
              type="checkbox"
              value={role}
              className="h-4 w-4 rounded border-input"
              {...register('roleCodes')}
            />
            <Label htmlFor={`edit-role-${role}`} className="font-normal">
              {ROLE_LABELS[role]}
            </Label>
          </div>
        ))}
      </fieldset>
      {errors.roleCodes && (
        <p role="alert" className="text-sm text-destructive">
          {errors.roleCodes.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
