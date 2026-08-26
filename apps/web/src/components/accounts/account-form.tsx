'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// `super_admin`/`department_admin` exist as account.role values in the DB
// (reserved for future Department/Super-Admin tiering) but aren't offered
// here: RolesGuard's @Roles('admin') only matches the literal 'admin'
// role, so creating one of those from this form today would produce an
// account locked out of every admin-only page, including this one.
const ROLE_OPTIONS = ['admin', 'teacher'] as const;
const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  admin: 'Quản trị',
  teacher: 'Giảng viên',
};

const accountFormSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(ROLE_OPTIONS),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

export function AccountForm({
  onSubmit,
}: {
  onSubmit: (values: AccountFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { role: 'teacher' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Họ tên</Label>
        <Input id="account-name" {...register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" type="email" {...register('email')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-password">Mật khẩu</Label>
        <Input id="account-password" type="password" {...register('password')} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Vai trò</legend>
        {ROLE_OPTIONS.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <input
              id={`account-role-${role}`}
              type="radio"
              value={role}
              className="h-4 w-4 border-input"
              {...register('role')}
            />
            <Label htmlFor={`account-role-${role}`} className="font-normal">
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
      <Button type="submit">Lưu</Button>
    </form>
  );
}
