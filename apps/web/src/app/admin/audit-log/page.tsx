'use client';

import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { AuditLogFilter, AuditLogItem } from '@/lib/api/audit-log';

const NO_FILTER: AuditLogFilter = {};

/**
 * Nhật ký thao tác — đọc chỉ. Mọi lần ghi đè luật máy kiểm, sửa điểm sau khi chốt, đổi quyền... đều hiện ở đây để
 * admin đọc lại được ai đã làm gì, lúc nào. Chỉ hiện TÊN các trường đã đổi: giá trị cũ và mới không đưa ra màn này.
 */
export default function AuditLogPage() {
  const [draft, setDraft] = useState({ action: '', from: '' });
  const [applied, setApplied] = useState<AuditLogFilter>(NO_FILTER);
  const query = useAuditLog(applied);
  const items: AuditLogItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  function apply(e: FormEvent) {
    e.preventDefault();
    setApplied({
      action: draft.action.trim() || undefined,
      from: draft.from ? new Date(`${draft.from}T00:00:00`).toISOString() : undefined,
    });
  }

  function reset() {
    setDraft({ action: '', from: '' });
    setApplied(NO_FILTER);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nhật ký thao tác"
        description="Ai đã làm gì, lúc nào. Chỉ hiện tên các trường đã đổi; giá trị cũ và mới không hiện ở đây."
      />

      <form onSubmit={apply} className="flex flex-wrap items-end gap-3" aria-label="Bộ lọc nhật ký">
        <div className="flex min-w-[14rem] flex-col gap-1">
          <Label htmlFor="audit-action">Hành động</Label>
          <Input
            id="audit-action"
            placeholder="vd: grading.override"
            value={draft.action}
            onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="audit-from">Từ ngày</Label>
          <Input
            id="audit-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </div>
        <Button type="submit">Lọc</Button>
        <Button type="button" variant="outline" onClick={reset}>
          Xoá lọc
        </Button>
      </form>

      {query.isError && (
        <p role="alert" className="text-small text-danger-strong">
          Không tải được nhật ký. Thử tải lại trang.
        </p>
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
          Chưa có thao tác nào khớp bộ lọc.
        </p>
      )}

      {items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời điểm</TableHead>
              <TableHead>Người làm</TableHead>
              <TableHead>Hành động</TableHead>
              <TableHead>Đối tượng</TableHead>
              <TableHead>Trường đã đổi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(item.occurredAt).toLocaleString('vi-VN')}
                </TableCell>
                <TableCell>{item.actorName ?? 'Hệ thống'}</TableCell>
                <TableCell className="font-mono text-caption">{item.action}</TableCell>
                <TableCell className="text-caption">
                  {item.targetType} · <span className="font-mono">{item.targetId.slice(0, 8)}</span>
                </TableCell>
                <TableCell>
                  {item.changedFields.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {item.changedFields.map((f) => (
                        <span key={f} className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-caption">
                          {f}
                        </span>
                      ))}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {query.hasNextPage && (
        <div>
          <Button
            type="button"
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Tải thêm
          </Button>
        </div>
      )}
    </div>
  );
}
