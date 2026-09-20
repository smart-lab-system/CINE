'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { useRubrics } from '@/hooks/useGrading';
import { RubricEditor } from './_components/RubricEditor';

/**
 * Rubric thuộc MÔN HỌC — không thuộc lớp, không thuộc phiên thi.
 *
 * Trước đây editor sống trong trang Chấm điểm, nên muốn sửa rubric của một
 * môn thì phải chọn một phiên thi của môn đó trước. Từ khi rubric được ghim
 * lúc TẠO phiên thi, thứ tự ấy thành vô lý: rubric phải soạn xong trước khi
 * có phiên thi nào để mà chọn.
 */
export default function RubricsPage() {
  const classes = useTeachingClasses();
  const rubrics = useRubrics();

  // Mỗi MÔN mà giảng viên đang dạy được đề nghị một rubric cùng tên, cộng
  // với mọi rubric họ đã đặt tên khác. Gộp theo tên vì tên chính là định
  // danh của rubric từ đợt thu hẹp master data: lưu lại cùng một tên là tạo
  // bản kế tiếp, không phải một rubric thứ hai.
  const names = useMemo(() => {
    const fromClasses = (classes.data ?? []).map((klass) => klass.courseName);
    const fromRubrics = (rubrics.data ?? []).map((rubric) => rubric.name);
    return [...new Set([...fromClasses, ...fromRubrics])].sort((a, b) => a.localeCompare(b));
  }, [classes.data, rubrics.data]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rubric"
        description="Tiêu chí chấm của riêng bạn. Mỗi lần lưu tạo một phiên bản mới; phiên thi đã gắn phiên bản cũ vẫn giữ nguyên bản đó."
      />

      {classes.isLoading && <Skeleton className="h-40 w-full" />}

      {!classes.isLoading && names.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Bạn chưa có lớp nào, nên chưa có môn nào để soạn rubric sẵn.
          </AlertDescription>
        </Alert>
      )}

      {names.map((name) => (
        <RubricEditor key={name} name={name} />
      ))}
    </div>
  );
}
