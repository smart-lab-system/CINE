'use client';

import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useAuditLog } from '@/hooks/useAuditLog';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EMPTY_AUDIT_FILTERS,
  toSearchParams,
  type AuditFilterState,
} from '@/lib/audit-filters';
import { AuditFilters } from './_components/AuditFilters';
import { AuditTable } from './_components/AuditTable';

const PAGE_SIZE = 50;

/**
 * Đọc `audit_log`: ai đổi gì, khi nào. Chỉ đọc — nhật ký không sửa hay xoá được.
 *
 * Trang này để điều tra sự cố và đối chiếu khi giảng viên với quản trị viên nói
 * khác nhau. Nó KHÔNG phải một biện pháp kiểm soát quyền: với một quản trị
 * viên duy nhất, người đọc nhật ký cũng là người bị ghi trong đó (spec §4.2).
 */
export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);

  // Người thực hiện là mọi tài khoản có thể ghi nhật ký. Lỗi ở đây không được
  // chặn trang: bộ lọc chỉ mất danh sách người, bảng vẫn dùng được.
  const accounts = useAccounts({ page: 1, pageSize: 100 });
  const actors = (accounts.data?.items ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    role: account.role,
  }));

  const { data, error, isLoading, refetch } = useAuditLog(toSearchParams(filters, page, PAGE_SIZE));

  function changeFilters(next: AuditFilterState) {
    setFilters(next);
    // Đổi bộ lọc khi đang ở trang 3 sẽ rơi vào một trang 3 không tồn tại của
    // tập kết quả mới, và bảng hiện ra rỗng.
    setPage(1);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Audit log"
        description="Ai đã đổi gì, vào lúc nào. Chỉ đọc: nhật ký không thể sửa hay xoá. Dùng để điều tra khi có sự cố hoặc khi hai bên nói khác nhau."
      />

      <div data-animate className="flex flex-col gap-4">
        <AuditFilters
          value={filters}
          onChange={changeFilters}
          onClear={() => changeFilters(EMPTY_AUDIT_FILTERS)}
          actors={actors}
        />

        {isLoading ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Không tải được nhật ký. Hãy thử lại.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        ) : (data?.items.length ?? 0) === 0 ? (
          <Card>
            <EmptyState
              icon={ScrollText}
              title="Không có bản ghi nào khớp bộ lọc"
              description="Thử nới khoảng ngày hoặc chọn «Tất cả hành động»."
              tone="muted"
            />
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <AuditTable entries={data!.items} />
              </CardContent>
            </Card>
            <div className="flex items-center justify-between gap-3">
              <p className="text-small text-muted-foreground">
                Trang {page} / {totalPages} · {total} bản ghi
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
