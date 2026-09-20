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
 * Vì thế chưa soạn rubric nào KHÔNG chặn việc tạo phiên thi — chỉ nói cho
 * biết, kèm đường đi tới chỗ soạn.
 *
 * Danh sách là rubric của CHÍNH giảng viên, không còn của môn học: không ai
 * ghim được rubric của đồng nghiệp vào phiên của mình.
 */
export function RubricPicker() {
  const form = useFormContext<CreateExamSessionFormValues>();
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
