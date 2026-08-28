'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const schema = z.object({
  subjectId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  sectionCode: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  nominalClassCode: z.string().max(50).optional(),
  name: z.string().max(200).optional(),
  lecturerId: z.string().uuid().optional().or(z.literal('')),
  maxEnrollment: z.coerce.number().int().min(1).optional().or(z.literal('')),
});

export type CourseSectionFormValues = {
  subjectId: string;
  academicTermId: string;
  sectionCode: string;
  nominalClassCode?: string;
  name?: string;
  lecturerId?: string;
  maxEnrollment?: number;
};

export function CourseSectionForm({
  onSubmit,
  subjects,
  terms,
  lecturers = [],
  defaultValues,
  submitLabel = 'Lưu',
  lockRelations = false,
}: {
  onSubmit: (values: CourseSectionFormValues) => void;
  subjects: { id: string; code: string; name: string }[];
  terms: { id: string; code: string; name: string }[];
  lecturers?: { id: string; employeeCode: string; fullName: string }[];
  defaultValues?: Partial<CourseSectionFormValues>;
  submitLabel?: string;
  lockRelations?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      subjectId: defaultValues?.subjectId ?? '',
      academicTermId: defaultValues?.academicTermId ?? '',
      sectionCode: defaultValues?.sectionCode ?? '',
      nominalClassCode: defaultValues?.nominalClassCode ?? '',
      name: defaultValues?.name ?? '',
      lecturerId: defaultValues?.lecturerId ?? '',
      maxEnrollment: defaultValues?.maxEnrollment,
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          subjectId: values.subjectId,
          academicTermId: values.academicTermId,
          sectionCode: values.sectionCode,
          nominalClassCode: values.nominalClassCode || undefined,
          name: values.name || undefined,
          lecturerId: values.lecturerId || undefined,
          maxEnrollment:
            values.maxEnrollment === '' || values.maxEnrollment === undefined
              ? undefined
              : Number(values.maxEnrollment),
        }),
      )}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-subject">Môn học</Label>
        <Select
          id="section-subject"
          {...register('subjectId')}
          disabled={lockRelations}
        >
          <option value="">— Chọn môn —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
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
        <Label htmlFor="section-term">Học kỳ</Label>
        <Select
          id="section-term"
          {...register('academicTermId')}
          disabled={lockRelations}
        >
          <option value="">— Chọn học kỳ —</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
        </Select>
        {errors.academicTermId && (
          <p role="alert" className="text-sm text-destructive">
            Chọn học kỳ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-lecturer">Giảng viên phụ trách</Label>
        <Select id="section-lecturer" {...register('lecturerId')}>
          <option value="">— Không chọn —</option>
          {lecturers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.employeeCode} — {l.fullName}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-code">Mã lớp HP</Label>
        <Input
          id="section-code"
          placeholder="422000279301"
          {...register('sectionCode')}
          disabled={lockRelations}
        />
        {errors.sectionCode && (
          <p role="alert" className="text-sm text-destructive">
            Mã lớp không hợp lệ
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-nominal">Lớp hành chính (nếu có)</Label>
        <Input id="section-nominal" {...register('nominalClassCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-name">Tên lớp</Label>
        <Input id="section-name" {...register('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-max">Sĩ số tối đa</Label>
        <Input
          id="section-max"
          type="number"
          min={1}
          {...register('maxEnrollment')}
        />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
