'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// See account-form.tsx — super_admin/department_admin are reserved values,
// not offered here yet.
const ROLE_OPTIONS = ['admin', 'teacher'] as const;
const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  admin: 'Quản trị',
  teacher: 'Giảng viên',
};

// Email isn't editable here, matching the previous form's scope (username
// wasn't editable either) — keep the edit surface small.
const editAccountFormSchema = z.object({
  name: z.string().min(1).max(150),
  role: z.enum(ROLE_OPTIONS),
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
        <Label htmlFor="edit-name">Họ tên</Label>
        <Input id="edit-name" {...register('name')} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Vai trò</legend>
        {ROLE_OPTIONS.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <input
              id={`edit-role-${role}`}
              type="radio"
              value={role}
              className="h-4 w-4 border-input"
              {...register('role')}
            />
            <Label htmlFor={`edit-role-${role}`} className="font-normal">
              {ROLE_LABELS[role]}
            </Label>
          </div>
        ))}
      </fieldset>
      {errors.role && (
        <p role="alert" className="text-sm text-destructive">
          {errors.role.message}
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
