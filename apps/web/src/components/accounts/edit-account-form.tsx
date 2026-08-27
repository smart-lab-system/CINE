'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACCOUNT_ROLE_LABELS, ACCOUNT_ROLE_OPTIONS } from '@/lib/account-roles';

// Email isn't editable here, matching the previous form's scope (username
// wasn't editable either) — keep the edit surface small.
const editAccountFormSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập họ tên').max(150),
  role: z.enum(ACCOUNT_ROLE_OPTIONS),
});

export type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;

export function EditAccountForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues: EditAccountFormValues;
  onSubmit: (values: EditAccountFormValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const {
    register,
    control,
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
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-role">Vai trò</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ACCOUNT_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.role && (
          <p role="alert" className="text-sm text-destructive">
            {errors.role.message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
