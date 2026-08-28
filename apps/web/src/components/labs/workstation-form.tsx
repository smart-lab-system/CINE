'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const WORKSTATION_STATUSES = [
  'available',
  'maintenance',
  'broken',
  'retired',
] as const;

const WORKSTATION_TYPES = ['master', 'client'] as const;

const schema = z.object({
  assetCode: z.string().regex(/^[A-Za-z0-9._-]{2,64}$/),
  hostname: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/),
  macAddress: z.string().optional(),
  staticIpAddress: z.string().optional(),
  serialNumber: z.string().max(100).optional(),
  operatingSystem: z.string().max(120).optional(),
  isEnabled: z.boolean().optional(),
  type: z.enum(WORKSTATION_TYPES).optional(),
  status: z.enum(WORKSTATION_STATUSES).optional(),
  notes: z.string().optional(),
});

export type WorkstationFormValues = {
  assetCode: string;
  hostname: string;
  macAddress?: string;
  staticIpAddress?: string;
  serialNumber?: string;
  operatingSystem?: string;
  isEnabled?: boolean;
  type?: (typeof WORKSTATION_TYPES)[number];
  status?: (typeof WORKSTATION_STATUSES)[number];
  notes?: string;
};

export function WorkstationForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Lưu',
}: {
  onSubmit: (values: WorkstationFormValues) => void;
  defaultValues?: Partial<WorkstationFormValues>;
  submitLabel?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      assetCode: defaultValues?.assetCode ?? '',
      hostname: defaultValues?.hostname ?? '',
      macAddress: defaultValues?.macAddress ?? '',
      staticIpAddress: defaultValues?.staticIpAddress ?? '',
      serialNumber: defaultValues?.serialNumber ?? '',
      operatingSystem: defaultValues?.operatingSystem ?? '',
      isEnabled: defaultValues?.isEnabled ?? true,
      type: defaultValues?.type ?? 'client',
      status: defaultValues?.status ?? 'available',
      notes: defaultValues?.notes ?? '',
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        onSubmit({
          assetCode: values.assetCode,
          hostname: values.hostname,
          macAddress: values.macAddress || undefined,
          staticIpAddress: values.staticIpAddress || undefined,
          serialNumber: values.serialNumber || undefined,
          operatingSystem: values.operatingSystem || undefined,
          isEnabled: values.isEnabled,
          type: values.type,
          status: values.status,
          notes: values.notes || undefined,
        });
      })}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-asset">Mã tài sản</Label>
          <Input id="ws-asset" {...register('assetCode')} />
          {errors.assetCode && (
            <p role="alert" className="text-sm text-destructive">
              Mã tài sản không hợp lệ
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-hostname">Hostname</Label>
          <Input id="ws-hostname" {...register('hostname')} />
          {errors.hostname && (
            <p role="alert" className="text-sm text-destructive">
              Hostname không hợp lệ
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-mac">MAC</Label>
          <Input
            id="ws-mac"
            {...register('macAddress')}
            placeholder="aa:bb:cc:dd:ee:ff"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-ip">IP tĩnh</Label>
          <Input id="ws-ip" {...register('staticIpAddress')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-serial">Serial</Label>
          <Input id="ws-serial" {...register('serialNumber')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-os">Hệ điều hành</Label>
          <Input id="ws-os" {...register('operatingSystem')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-type">Loại máy</Label>
          <Select id="ws-type" {...register('type')}>
            <option value="client">Máy sinh viên (Student PC)</option>
            <option value="master">Máy giảng viên (Instructor PC)</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ws-status">Trạng thái</Label>
          <Select id="ws-status" {...register('status')}>
            <option value="available">Sẵn sàng</option>
            <option value="maintenance">Bảo trì</option>
            <option value="broken">Hỏng</option>
            <option value="retired">Ngừng dùng</option>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ws-notes">Ghi chú</Label>
        <Input id="ws-notes" {...register('notes')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isEnabled')} />
        Đang bật
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
