'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './datetime-local';
import type { SessionType, SubjectOption } from './exam-types';

const schema = z.object({
  subjectId: z.string().uuid(),
  code: z.string().regex(/^[A-Za-z0-9._-]{2,64}$/),
  title: z.string().min(1).max(250),
  sessionType: z.enum(['exam', 'practice']),
  scheduledStartAt: z.string().min(1),
  scheduledEndAt: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(1).max(32767),
});

export type ExamEventFormValues = {
  subjectId: string;
  code: string;
  title: string;
  sessionType: SessionType;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
};

export function ExamEventForm({
  onSubmit,
  subjects,
  defaultValues,
  submitLabel = 'Lưu',
  lockSubject = false,
}: {
  onSubmit: (values: ExamEventFormValues) => void;
  subjects: SubjectOption[];
  defaultValues?: Partial<ExamEventFormValues>;
  submitLabel?: string;
  lockSubject?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      subjectId: defaultValues?.subjectId ?? '',
      code: defaultValues?.code ?? '',
      title: defaultValues?.title ?? '',
      sessionType: defaultValues?.sessionType ?? 'exam',
      scheduledStartAt: toDatetimeLocalValue(defaultValues?.scheduledStartAt),
      scheduledEndAt: toDatetimeLocalValue(defaultValues?.scheduledEndAt),
      durationMinutes: defaultValues?.durationMinutes ?? 90,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          subjectId: values.subjectId,
          code: values.code,
          title: values.title,
          sessionType: values.sessionType,
          scheduledStartAt: fromDatetimeLocalValue(values.scheduledStartAt),
          scheduledEndAt: fromDatetimeLocalValue(values.scheduledEndAt),
          durationMinutes: Number(values.durationMinutes),
        }),
      )}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam-subject">Môn học</Label>
        <Select
          id="exam-subject"
          {...register('subjectId')}
          disabled={lockSubject}
        >
          <option value="">— Chọn môn —</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.code} — {subject.name}
            </option>
          ))}
        </Select>
        {errors.subjectId && (
          <p role="alert" className="text-sm text-destructive">
            Chọn môn học
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam-code">Mã đề thi</Label>
        <Input id="exam-code" {...register('code')} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            Mã đề thi không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam-title">Tiêu đề</Label>
        <Input id="exam-title" {...register('title')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam-session-type">Loại</Label>
        <Select id="exam-session-type" {...register('sessionType')}>
          <option value="exam">Thi</option>
          <option value="practice">Thực hành</option>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-start">Bắt đầu</Label>
          <Input
            id="exam-start"
            type="datetime-local"
            {...register('scheduledStartAt')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-end">Kết thúc</Label>
          <Input
            id="exam-end"
            type="datetime-local"
            {...register('scheduledEndAt')}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam-duration">Thời lượng (phút)</Label>
        <Input
          id="exam-duration"
          type="number"
          min={1}
          {...register('durationMinutes')}
        />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
