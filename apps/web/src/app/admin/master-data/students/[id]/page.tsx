'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';
import { useStudent } from '@/hooks/useMasterData';
import { cn } from '@/lib/utils';
import {
  catalogActiveStatusLabel,
  studentStatusLabel,
} from '@/lib/master-data-defaults';
import { CatalogSection } from '../../_components/catalog-table';

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StudentDetail studentId={id} />
    </Suspense>
  );
}

function StudentDetail({ studentId }: { studentId: string }) {
  const router = useRouter();
  const student = useStudent(studentId);

  if (student.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (student.isError || !student.data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/master-data/students">
            <ArrowLeft className="size-4" />
            Quay lại danh sách sinh viên
          </Link>
        </Button>
        <p className="text-muted-foreground">Không tìm thấy sinh viên.</p>
      </div>
    );
  }

  const s = student.data;
  const nc = s.nominalClass;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/admin/master-data/students">
            <ArrowLeft className="size-4" />
            Quay lại danh sách sinh viên
          </Link>
        </Button>
        <PageHeader
          title={s.fullName}
          description={`${s.mssv} · ${studentStatusLabel(s.status)}`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin sinh viên</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="MSSV" value={s.mssv} mono />
            <DetailRow label="Họ tên" value={s.fullName} />
            <DetailRow label="Trạng thái" value={studentStatusLabel(s.status)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lớp danh nghĩa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Mã lớp" value={nc.code} mono />
            <DetailRow label="Tên lớp" value={nc.name ?? '—'} />
            <DetailRow
              label="Khóa"
              value={nc.cohortYear != null ? String(nc.cohortYear) : '—'}
            />
            <DetailRow
              label="Trạng thái"
              value={catalogActiveStatusLabel(nc.status)}
            />
          </CardContent>
        </Card>
      </div>

      <CatalogSection
        title="Lớp học phần"
        description="Các lớp học phần sinh viên đang được ghi danh."
        headers={['Mã lớp', 'Môn học', 'Học kỳ', 'Giảng viên']}
        empty="Chưa ghi danh lớp học phần nào."
        rows={
          s.courseSections.length
            ? s.courseSections.map((section) => (
                <TableRow
                  key={section.id}
                  className={cn('cursor-pointer')}
                  onClick={() =>
                    router.push(`/admin/course-sections/${section.id}`)
                  }
                  title="Xem lớp học phần"
                >
                  <TableCell className="font-mono">{section.name}</TableCell>
                  <TableCell>{section.courseName}</TableCell>
                  <TableCell>{section.semesterName ?? '—'}</TableCell>
                  <TableCell>{section.teacherName ?? 'Chưa phân công'}</TableCell>
                </TableRow>
              ))
            : null
        }
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right font-medium', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}
