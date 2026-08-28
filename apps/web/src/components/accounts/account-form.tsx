'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <FormField id="account-name" label="Họ tên" error={errors.name?.message}>
        <Input id="account-name" invalid={Boolean(errors.name)} {...register('name')} />
      </FormField>

      <FormField id="account-email" label="Email" error={errors.email?.message}>
        <Input
          id="account-email"
          type="email"
          autoComplete="off"
          placeholder="ten.giangvien@truong.edu.vn"
          invalid={Boolean(errors.email)}
          {...register('email')}
        />
      </FormField>

      <FormField
        id="account-password"
        label="Mật khẩu"
        error={errors.password?.message}
        // The rule is stated up front rather than only after a rejected
        // submit — it's cheaper to meet a requirement you can see.
        hint="Tối thiểu 8 ký tự. Người dùng nên đổi lại sau lần đăng nhập đầu."
      >
        <Input
          id="account-password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </FormField>

      <FormField id="account-role" label="Vai trò" error={errors.role?.message}>
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
      </FormField>

      <Button type="submit" className="w-full" loading={submitting}>
        {submitting ? 'Đang tạo…' : 'Tạo tài khoản'}
      </Button>
    </form>
  );
}
