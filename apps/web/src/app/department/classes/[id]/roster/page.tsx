'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RosterScreen } from '@/components/roster/roster-screen';
import { useMyClasses, useMyCourses } from '@/hooks/useDepartment';

/**
 * A Trưởng khoa looking at one class's list — read only.
 *
 * They need a department's headcounts, and a class with no roster is
 * something they should be able to see before exam day. But the list has
 * exactly ONE writer, the lecturer who teaches the class: two roles
 * maintaining the same roster means two people who can disagree about who
 * maintains it.
 */
export default function DepartmentRosterPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;

  const classes = useMyClasses();
  const courses = useMyCourses();
  const klass = classes.data?.find((c) => c.id === classId);
  const course = courses.data?.find((c) => c.id === klass?.courseId);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={klass ? `Danh sách lớp — ${klass.name}` : 'Danh sách lớp'}
        description={
          course
            ? `${course.code} — ${course.name}.`
            : 'Danh sách sinh viên của một lớp trong khoa.'
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/department/classes">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách lớp học
            </Link>
          </Button>
        }
      />

      <Alert variant="info">
        <AlertDescription>
          Bạn xem được danh sách này nhưng không sửa. Giảng viên phụ trách lớp là người nhập
          và chỉnh — họ nhận file từ phòng đào tạo, và họ là người phát hiện ra sai sót vào
          ngày thi.
        </AlertDescription>
      </Alert>

      <RosterScreen classId={classId} canEdit={false} />
    </div>
  );
}
