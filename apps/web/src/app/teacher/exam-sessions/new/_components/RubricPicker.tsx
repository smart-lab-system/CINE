'use client';

import Link from 'next/link';
import { Controller, useFormContext } from 'react-hook-form';
import { FormField } from '@/components/ui/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRubrics } from '@/hooks/useGrading';
import type { CreateExamSessionFormValues } from '../schema';

/**
 * Rubric của phiên thi được chọn ở ĐÂY, lúc ra đề — không tra lại lúc chấm.
 *
 * Tuỳ chọn, theo §3.1 kế hoạch tổng thể ("gắn rubric chấm điểm — nếu dùng AI
 * chấm"): phiên không gắn rubric vẫn tạo, thi và thu bài bình thường; chỉ
 * "Bắt đầu chấm" là bị chặn, và giảng viên gắn được sau ở trang Chấm điểm.
 *
 * Vì thế môn chưa có rubric nào KHÔNG chặn việc tạo phiên thi — chỉ nói cho
 * biết, kèm đường đi tới chỗ soạn.
 */
export function RubricPicker({ courseId }: { courseId: string | undefined }) {
  const form = useFormContext<CreateExamSessionFormValues>();
  const rubrics = useRubrics(courseId);
  const options = rubrics.data ?? [];
  const empty = Boolean(courseId) && !rubrics.isLoading && options.length === 0;

  return (
    <FormField
      id="exam-session-rubric"
      label="Rubric chấm điểm"
      hint="Không bắt buộc. Có thể gắn sau, cho tới khi bài đầu tiên được chấm."
      error={form.formState.errors.rubricId?.message}
    >
      <Controller
        control={form.control}
        name="rubricId"
        render={({ field }) => (
          <Select
            value={field.value ?? ''}
            onValueChange={field.onChange}
            disabled={!courseId || rubrics.isLoading || options.length === 0}
          >
            <SelectTrigger id="exam-session-rubric">
              <SelectValue
                placeholder={
                  !courseId
                    ? 'Chọn lớp học trước'
                    : rubrics.isLoading
                      ? 'Đang tải…'
                      : 'Chưa chọn rubric'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                  {rubric.isActive ? ' (mới nhất)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />

      {empty && (
        <Alert variant="info">
          <AlertDescription>
            Môn này chưa có rubric nào.{' '}
            <Link href="/teacher/rubrics" className="font-semibold underline">
              Soạn rubric
            </Link>{' '}
            rồi quay lại — hoặc cứ tạo phiên thi và gắn sau.
          </AlertDescription>
        </Alert>
      )}
    </FormField>
  );
}
