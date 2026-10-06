'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { RosterScreen } from '@/components/roster/roster-screen';
import { useTeachingClasses } from '@/hooks/useTeaching';

/**
 * The lecturer's own class list. Lớp do admin tạo và giao; từ đó danh sách là của giảng viên, và họ có thể nạp file hoặc gõ từng sinh viên.
 *
 * They own it because they are the one the training office sends the file
 * to, and the one who finds out on exam day that it is wrong.
 */
export default function TeacherRosterPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const classes = useTeachingClasses();
  const klass = classes.data?.find((c) => c.id === classId);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={klass ? `Danh sách lớp — ${klass.label}` : 'Danh sách lớp'}
        description={
          klass
            ? `Lớp ${klass.labelWithSemester}. Đây là danh sách quyết định ai được vào phiên thi của lớp này.`
            : 'Danh sách quyết định ai được vào phiên thi của lớp này.'
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/classes">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Lớp của tôi
            </Link>
          </Button>
        }
      />

      <RosterScreen classId={classId} canEdit />
    </div>
  );
}
