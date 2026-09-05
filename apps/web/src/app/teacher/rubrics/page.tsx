'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeachingClasses } from '@/hooks/useTeaching';
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

  // Hai lớp cùng môn dùng CHUNG một rubric — gộp lại. Hiện hai dòng là nói
  // dối: sửa dòng này thì dòng kia đổi theo, và không có gì báo cho giảng
  // viên biết điều đó.
  const courses = useMemo(() => {
    const seen = new Map<string, string>();
    for (const klass of classes.data ?? []) {
      if (!seen.has(klass.courseId)) seen.set(klass.courseId, klass.courseName);
    }
    return [...seen].map(([courseId, courseName]) => ({ courseId, courseName }));
  }, [classes.data]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rubric"
        description="Tiêu chí chấm của từng môn bạn dạy. Mỗi lần lưu tạo một phiên bản mới; phiên thi đã gắn phiên bản cũ vẫn giữ nguyên bản đó."
      />

      {classes.isLoading && <Skeleton className="h-40 w-full" />}

      {!classes.isLoading && courses.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Bạn chưa dạy lớp nào, nên chưa có môn nào để soạn rubric.
          </AlertDescription>
        </Alert>
      )}

      {courses.map((course) => (
        <RubricEditor
          key={course.courseId}
          courseId={course.courseId}
          courseName={course.courseName}
        />
      ))}
    </div>
  );
}
