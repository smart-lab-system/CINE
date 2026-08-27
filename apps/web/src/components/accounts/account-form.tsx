'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACCOUNT_ROLE_LABELS, ACCOUNT_ROLE_OPTIONS } from '@/lib/account-roles';

const accountFormSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập họ tên').max(150),
  email: z.string().email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(128, 'Mật khẩu tối đa 128 ký tự'),
  role: z.enum(ACCOUNT_ROLE_OPTIONS),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

export function AccountForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (values: AccountFormValues) => void;
  submitting?: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { name: '', email: '', password: '', role: 'teacher' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Họ tên</Label>
        <Input id="account-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" type="email" {...register('email')} />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-password">Mật khẩu</Label>
        <Input id="account-password" type="password" {...register('password')} />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-role">Vai trò</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="account-role">
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
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Đang lưu…' : 'Lưu'}
      </Button>
    </form>
  );
}
