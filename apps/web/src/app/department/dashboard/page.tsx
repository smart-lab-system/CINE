'use client';

import Link from 'next/link';
import { BookOpen, CalendarRange, DoorOpen, GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMyClasses, useMyCourses, useRooms, useSemesters } from '@/hooks/useDepartment';

/**
 * What a Trưởng khoa is responsible for, in the order it has to be built:
 * a term, then a course inside it, then a class with a lecturer. The counts
 * exist mainly to surface the empty link in that chain — a lecturer with no
 * class cannot create an exam session at all, and that failure otherwise
 * only shows up on their screen, not here.
 */
export default function DepartmentDashboardPage() {
  const semesters = useSemesters();
  const courses = useMyCourses();
  const classes = useMyClasses();
  const rooms = useRooms();

  // Không có học kỳ nào thì cả chuỗi đứng lại, nhưng Trưởng khoa KHÔNG tự
  // tạo được nữa (học kỳ là cấp trường — CLAUDE.md §1.4). Nói rõ phải nhờ
  // ai, thay vì đưa một link dẫn tới màn hình họ không có quyền.
  const noSemester = (semesters.data?.length ?? 0) === 0;
  const missingLink = noSemester
    ? null
    : (courses.data?.length ?? 0) === 0
      ? { href: '/department/courses', what: 'môn học', next: 'lớp học' }
      : (classes.data?.length ?? 0) === 0
        ? { href: '/department/classes', what: 'lớp học', next: 'phiên thi' }
        : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tài nguyên học vụ của khoa bạn. Học kỳ và phòng thi do quản trị viên khai báo dùng chung toàn trường; môn học và lớp học thuộc riêng khoa bạn."
      />

      {noSemester && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có học kỳ nào trong hệ thống — chưa tạo được môn học. Học kỳ do
            quản trị viên khai báo dùng chung toàn trường, hãy liên hệ quản trị
            viên để mở học kỳ mới.
          </AlertDescription>
        </Alert>
      )}

      {missingLink && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có {missingLink.what} nào — chưa tạo được {missingLink.next}.{' '}
            <Link href={missingLink.href} className="font-semibold underline">
              Tạo {missingLink.what} ngay
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarRange}
          label="Học kỳ"
          value={semesters.data?.length ?? 0}
          hint="Dùng chung toàn trường"
          isError={semesters.isError}
        />
        <StatCard
          icon={BookOpen}
          label="Môn học của khoa"
          value={courses.data?.length ?? 0}
          hint="Chỉ các môn bạn phụ trách"
          isError={courses.isError}
        />
        <StatCard
          icon={GraduationCap}
          label="Lớp học"
          value={classes.data?.length ?? 0}
          hint="Thuộc các môn của khoa bạn"
          isError={classes.isError}
        />
        <StatCard
          icon={DoorOpen}
          label="Phòng thi"
          value={rooms.data?.length ?? 0}
          hint="Dùng chung toàn trường"
          isError={rooms.isError}
        />
      </div>
    </div>
  );
}
