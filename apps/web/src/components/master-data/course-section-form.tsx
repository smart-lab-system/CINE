'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const courseSectionFormSchema = z.object({
  subjectId: z.string().uuid('Chọn môn học'),
  academicTermId: z.string().uuid('Chọn học kỳ'),
  sectionCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  nominalClassCode: z.string().max(50).optional(),
  name: z.string().max(200).optional(),
});

export type CourseSectionFormValues = z.infer<typeof courseSectionFormSchema>;

interface ReferenceOption {
  id: string;
  code: string;
  name: string;
}

// Reference options for the subject/term selects — fetched here directly
// rather than through useEntityCrud, since these are auxiliary lookup
// lists for this form, not the resource the surrounding page manages.
function useReferenceOptions() {
  const subjects = useQuery({
    queryKey: ['subjects', '__all__'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { search: '', page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: ReferenceOption[] }).items;
    },
  });

  const terms = useQuery({
    queryKey: ['academic-terms', '__all__'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { search: '', page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: ReferenceOption[] }).items;
    },
  });

  return { subjects: subjects.data ?? [], terms: terms.data ?? [] };
}

export function CourseSectionForm({
  onSubmit,
}: {
  onSubmit: (values: CourseSectionFormValues) => void;
}) {
  const { subjects, terms } = useReferenceOptions();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CourseSectionFormValues>({ resolver: zodResolver(courseSectionFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-subject">Môn học</Label>
        <select
          id="section-subject"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
          {...register('subjectId')}
        >
          <option value="">-- Chọn môn học --</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.code} — {subject.name}
            </option>
          ))}
        </select>
        {errors.subjectId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.subjectId.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-term">Học kỳ</Label>
        <select
          id="section-term"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
          {...register('academicTermId')}
        >
          <option value="">-- Chọn học kỳ --</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.code} — {term.name}
            </option>
          ))}
        </select>
        {errors.academicTermId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.academicTermId.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-code">Mã lớp học phần</Label>
        <Input id="section-code" {...register('sectionCode')} />
        {errors.sectionCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.sectionCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-nominal-class-code">Lớp danh nghĩa</Label>
        <Input id="section-nominal-class-code" {...register('nominalClassCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-name">Tên lớp học phần</Label>
        <Input id="section-name" {...register('name')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
