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

const accountFormSchema = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1).max(150),
  password: z.string().min(8).max(128),
  roleCodes: z.array(z.enum(ROLE_OPTIONS)).min(1, 'Chọn ít nhất một vai trò'),
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
    defaultValues: { roleCodes: [] },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-username">Tên đăng nhập</Label>
        <Input id="account-username" {...register('username')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-display-name">Họ tên</Label>
        <Input id="account-display-name" {...register('displayName')} />
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
              type="checkbox"
              value={role}
              className="h-4 w-4 rounded border-input"
              {...register('roleCodes')}
            />
            <Label htmlFor={`account-role-${role}`} className="font-normal">
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
      <Button type="submit">Lưu</Button>
    </form>
  );
}
