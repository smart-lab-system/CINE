'use client';

import Link from 'next/link';
import { CalendarClock, ClipboardCheck, GraduationCap, Inbox, Plus, type LucideIcon } from 'lucide-react';
import { useExamSessions } from '@/hooks/useExamSession';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';

interface QuickLink {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

// Lối tắt tới các việc hay làm nhất của giảng viên. Chỉ trỏ tới màn hình đã có
// (không có thẻ giữ chỗ nào nữa: số nào chưa có dữ liệu thật thì không hiển thị).
const QUICK_LINKS: QuickLink[] = [
  { href: '/teacher/exam-sessions', label: 'Quản lý kỳ thi', hint: 'Tạo, mở và theo dõi phiên thi', icon: CalendarClock },
  { href: '/teacher/submissions', label: 'Quản lý bài thu', hint: 'Xem file bài nộp của từng phiên', icon: Inbox },
  { href: '/teacher/grading', label: 'Chấm điểm', hint: 'Duyệt kết quả AI và chốt điểm', icon: ClipboardCheck },
  { href: '/teacher/classes', label: 'Lớp của tôi', hint: 'Danh sách lớp và sinh viên', icon: GraduationCap },
];

export default function TeacherDashboardPage() {
  // pageSize: 1 - only `total` is read here; the list itself is what
  // /teacher/exam-sessions renders.
  const { data, isLoading, isError } = useExamSessions({ page: 1, pageSize: 1 });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Tổng quan các phiên thi bạn phụ trách và việc cần làm tiếp theo."
        actions={
          <Button asChild>
            <Link href="/teacher/exam-sessions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo phiên thi
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={CalendarClock}
          label="Phiên thi đã tạo"
          value={isLoading ? null : (data?.total ?? '-')}
          variant="accent"
          hint="Tổng số phiên thi bạn đã tạo"
          isError={isError}
        />
      </div>

      <section aria-labelledby="quick-links-title" className="flex flex-col gap-3">
        <h2 id="quick-links-title" className="section-label">
          Đi tới
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map(({ href, label, hint, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="card-elevated group flex h-full items-start gap-3 p-4 hover:border-primary/30 focus-visible:outline-none"
              >
                <span className="icon-chip h-10 w-10 bg-primary-subtle text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-small font-semibold text-foreground group-hover:text-primary">{label}</span>
                  <span className="text-caption text-muted-foreground">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
