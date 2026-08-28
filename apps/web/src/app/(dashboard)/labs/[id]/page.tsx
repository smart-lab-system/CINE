'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LabSubnav } from '@/components/labs/lab-subnav';
import { PageHeader } from '@/components/layout/page-header';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

interface LabDetail {
  id: string;
  code: string;
  name: string;
  building: string | null;
  floor: string | null;
  capacity: number;
  description: string | null;
  isActive: boolean;
}

export default function LabDetailPage() {
  const params = useParams<{ id: string }>();
  const labId = params.id;

  const labQuery = useQuery({
    queryKey: ['labs', labId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/labs/{id}', {
        params: { path: { id: labId } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as LabDetail;
    },
  });

  if (labQuery.isLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      </PageShell>
    );
  }

  if (labQuery.error || !labQuery.data) {
    return (
      <PageShell>
        <p role="alert" className="text-sm text-destructive">
          Không tải được phòng máy.
        </p>
        <Button variant="outline" asChild className="mt-4 w-fit">
          <Link href="/labs">← Danh sách</Link>
        </Button>
      </PageShell>
    );
  }

  const lab = labQuery.data;

  return (
    <PageShell>
      <PageHeader
        title={`${lab.code} — ${lab.name}`}
        description="Thông tin phòng máy và lối tắt quản lý."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/labs">Quay lại</Link>
            </Button>
            <Button asChild>
              <Link href={`/labs/${labId}/edit`}>Sửa thông tin</Link>
            </Button>
          </>
        }
      />
      <LabSubnav labId={labId} />

      <Card>
        <CardHeader>
          <CardTitle>Thông tin phòng</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Mã</p>
            <p className="font-medium">{lab.code}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tên</p>
            <p className="font-medium">{lab.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tòa / Tầng</p>
            <p className="font-medium">
              {[lab.building, lab.floor].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Sức chứa</p>
            <p className="font-medium">{lab.capacity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Trạng thái</p>
            <p className="font-medium">
              {lab.isActive ? 'Đang dùng' : 'Tắt'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground">Mô tả</p>
            <p className="font-medium">{lab.description || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Máy trạm</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Quản lý danh sách máy trong phòng.
            </p>
            <Button asChild>
              <Link href={`/labs/${labId}/workstations`}>Xem máy trạm</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sơ đồ chỗ ngồi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Layout và editor sắp xếp chỗ ngồi.
            </p>
            <Button asChild>
              <Link href={`/labs/${labId}/layouts`}>Xem sơ đồ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
