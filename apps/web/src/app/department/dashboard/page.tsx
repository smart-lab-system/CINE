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

  /**
   * Mắt nối còn thiếu trong chuỗi: kỳ → môn → lớp → phiên thi. Nhưng chủ thể
   * của hai mắt đầu đã đổi ở spec ranh-giới-sở-hữu, nên câu chữ phải đổi theo.
   *
   * `href: null` cho nhánh học kỳ là điều quan trọng nhất ở đây: trước đây nó
   * trỏ `/department/semesters`, một route đã bị xoá (404), kèm chỉ dẫn "Tạo
   * học kỳ ngay" mà API trả 403. Một cái nút không làm được việc nó nói còn tệ
   * hơn không có nút.
   */
  const missingLink: { text: string; href: string | null; cta?: string } | null =
    (semesters.data?.length ?? 0) === 0
      ? {
          text: 'Phòng Đào tạo chưa tạo học kỳ nào — chưa tạo được môn học.',
          href: null,
        }
      : (courses.data?.length ?? 0) === 0
        ? {
            text: 'Chưa có môn học nào — chưa tạo được lớp học. Bạn có thể tự tạo, hoặc chờ Phòng Đào tạo phân công.',
            href: '/department/courses',
            cta: 'Tạo môn học ngay',
          }
        : (classes.data?.length ?? 0) === 0
          ? {
              text: 'Chưa có lớp học nào — chưa tạo được phiên thi.',
              href: '/department/classes',
              cta: 'Tạo lớp học ngay',
            }
          : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tài nguyên học vụ của khoa bạn. Học kỳ và phòng thi do Phòng Đào tạo quản lý; môn học và lớp học thuộc riêng khoa bạn."
      />

      {missingLink && (
        <Alert variant="info">
          <AlertDescription>
            {missingLink.text}
            {missingLink.href && (
              <>
                {' '}
                <Link href={missingLink.href} className="font-semibold underline">
                  {missingLink.cta}
                </Link>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarRange}
          label="Học kỳ"
          value={semesters.data?.length ?? 0}
          hint="Dùng chung toàn trường — Phòng Đào tạo quản lý"
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
          hint="Dùng chung toàn trường — Phòng Đào tạo quản lý"
          isError={rooms.isError}
        />
      </div>
    </div>
  );
}
