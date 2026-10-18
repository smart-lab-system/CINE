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

/** Form tối thiểu — create-slim không còn dùng picker trên form tạo; giữ cho test. */
type RubricPickerForm = { rubricId?: string };

/**
 * Rubric gắn phiên — hiện dùng trên hub qua `RubricRow`; component này còn
 * cho test / tái sử dụng form có field `rubricId`.
 *
 * Tuỳ chọn: phiên không gắn rubric vẫn tạo, thi và thu bài bình thường; chỉ
 * "Bắt đầu chấm" là bị chặn.
 */
export function RubricPicker() {
  const form = useFormContext<RubricPickerForm>();
  const rubrics = useRubrics();
  const options = rubrics.data ?? [];
  const empty = !rubrics.isLoading && options.length === 0;

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
            disabled={rubrics.isLoading || options.length === 0}
          >
            <SelectTrigger id="exam-session-rubric">
              <SelectValue
                placeholder={rubrics.isLoading ? 'Đang tải…' : 'Chưa chọn rubric'}
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  {rubric.name} — bản {rubric.version}, {rubric.totalPoints} điểm
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
            Bạn chưa soạn rubric nào.{' '}
            <Link href="/teacher/rules" className="font-semibold underline">
              Soạn rubric ở Bảng lỗi
            </Link>{' '}
            rồi quay lại — hoặc cứ tạo phiên thi và gắn sau.
          </AlertDescription>
        </Alert>
      )}
    </FormField>
  );
}
