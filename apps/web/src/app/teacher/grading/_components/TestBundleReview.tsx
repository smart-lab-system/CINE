'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTestBundles } from '@/hooks/useTestBundle';
import { useTestBundleDetail } from '@/hooks/useTestBundleDetail';
import { Alert, AlertDescription } from '@/components/ui/alert';

const when = (iso: string) => new Date(iso).toLocaleString('vi-VN');

/**
 * Gói test đã dùng để chấm — chỉ đọc. Không sinh, không duyệt, không ghim, không chạy, không sửa ca.
 */
export function TestBundleReview({
  sessionId,
  pinnedBundleId,
}: {
  sessionId: string;
  pinnedBundleId: string | null;
}) {
  const bundles = useTestBundles(sessionId);
  const detail = useTestBundleDetail(sessionId, pinnedBundleId);
  const list = bundles.data ?? [];
  const pinned = pinnedBundleId ? list.find((b) => b.id === pinnedBundleId) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h3">Gói test</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {bundles.isLoading && <p className="text-small text-muted-foreground">Đang tải…</p>}
        {!bundles.isLoading && list.length > 0 && (
          <ul aria-label="Các phiên bản gói test" className="flex flex-col gap-2">
            {list.map((bundle) => (
              <li key={bundle.id} className="flex flex-wrap items-center gap-2 text-small">
                <span className="font-medium">Phiên bản {bundle.version}</span>
                <span className="text-caption text-muted-foreground">{bundle.caseCount} ca</span>
                {bundle.id === pinnedBundleId && <Badge variant="accent">Đang dùng</Badge>}
              </li>
            ))}
          </ul>
        )}

        {!bundles.isLoading && !pinnedBundleId && (
          <p className="text-small text-muted-foreground">Chưa ghim gói test.</p>
        )}

        {pinnedBundleId && pinned && (
          <p className="text-caption text-muted-foreground">
            {pinned.approvedAt ? `Đã duyệt lúc ${when(pinned.approvedAt)}.` : 'Chưa ghi nhận lúc duyệt.'}
          </p>
        )}

        {pinnedBundleId && detail.isLoading && <p className="text-caption text-muted-foreground">Đang tải bộ ca…</p>}
        {pinnedBundleId && detail.isError && (
          <Alert variant="destructive">
            <AlertDescription>{detail.error?.message ?? 'Không tải được bộ ca.'}</AlertDescription>
          </Alert>
        )}
        {pinnedBundleId && detail.data && detail.data.cases.length === 0 && (
          <p className="text-small text-muted-foreground">Gói đang dùng không có ca nào.</p>
        )}
        {pinnedBundleId && detail.data && detail.data.cases.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-left text-small">
              <caption className="sr-only">Bộ ca của gói đang dùng</caption>
              <thead>
                <tr className="text-caption text-muted-foreground">
                  <th scope="col" className="py-1 pr-2">Nhóm</th>
                  <th scope="col" className="py-1 pr-2">Input</th>
                  <th scope="col" className="py-1 pr-2">Output mong đợi</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.cases.map((c) => (
                  <tr key={c.caseKey}>
                    <td className={`break-words py-1 pr-2 align-top ${c.autoDroppedReason ? 'text-muted-foreground line-through' : ''}`}>{c.group}</td>
                    <td className={`break-all py-1 pr-2 align-top font-mono text-caption ${c.autoDroppedReason ? 'text-muted-foreground line-through' : ''}`}>{c.input}</td>
                    <td className="py-1 pr-2 align-top">
                      <span className={`break-all font-mono text-caption ${c.autoDroppedReason ? 'text-muted-foreground line-through' : ''}`}>{c.expectedOutput}</span>
                      {c.autoDroppedReason ? <span className="mt-1 block text-caption text-muted-foreground">Đã bỏ: {c.autoDroppedReason}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
