'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <FormField id="edit-name" label="Họ tên" error={errors.name?.message}>
        <Input id="edit-name" invalid={Boolean(errors.name)} {...register('name')} />
      </FormField>

      <FormField
        id="edit-role"
        label="Vai trò"
        error={errors.role?.message}
        hint="Đổi sang Quản trị sẽ cấp quyền vào toàn bộ khu vực quản trị."
      >
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
      </FormField>

      {/* Safe option on the left, committing action on the right — the
          conventional order, and the one the DOM follows too, so tabbing
          reaches "Hủy" before "Lưu thay đổi" rather than landing on the
          destructive-by-accident choice first. */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}
