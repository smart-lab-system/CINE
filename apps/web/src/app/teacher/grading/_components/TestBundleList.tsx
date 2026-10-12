'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApproveTestBundle, usePinTestBundle, useTestBundles } from '@/hooks/useTestBundle';
import { useDropTestBundleCase, useTestBundleDetail } from '@/hooks/useTestBundleDetail';

const formatMoment = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'không rõ lúc');

/**
 * Danh sách gói test + bảng duyệt bộ ca (UI spec §3.7, T-UI-18).
 *
 * Năm cột đúng như spec. Cột "câu trong đề mà ca này kiểm" đọc
 * `constraint_quote` — KHÔNG suy từ `group` (Security rule 9: cột nào kiểm
 * cái gì phải được nói thẳng, không đoán), nên ca giảng viên tự gõ hiện "—".
 *
 * Ca hệ thống đã tự bỏ vẫn hiện, gạch ngang, kèm lý do. Nó KHÔNG tính vào
 * `caseCount` (`TestBundleService.list` đã loại sẵn), nên con số ở đây là
 * số ca THẬT sự chạy.
 */
export function TestBundleList({ sessionId, pinnedBundleId }: { sessionId: string; pinnedBundleId: string | null }) {
  const bundles = useTestBundles(sessionId);
  const approveBundle = useApproveTestBundle(sessionId);
  const pinBundle = usePinTestBundle(sessionId);
  const dropCase = useDropTestBundleCase(sessionId);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (bundles.isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  if ((bundles.data?.length ?? 0) === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
        Chưa có gói test nào — bài code không chấm được cho tới khi có một gói đã duyệt và ghim (§14.3).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bundles.data!.map((bundle) => {
        // Chỉ hai giá trị này mới là "hệ thống sinh"; `origin` vắng (API cũ) KHÔNG bị tính là hệ thống sinh.
        const systemMade = bundle.origin === 'generated' || bundle.origin === 'from_model_answer';
        return (
          <div key={bundle.id} className="rounded-md border border-border bg-surface p-3 text-small">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Phiên bản {bundle.version}</span>
              <span className="text-caption text-muted-foreground">{bundle.caseCount} ca</span>
              {systemMade && <Badge variant="warning">Thước do hệ thống sinh</Badge>}
              {bundle.id === pinnedBundleId ? (
                <Badge variant="accent">Đang dùng</Badge>
              ) : bundle.approvedAt ? (
                <Button type="button" size="sm" variant="outline" onClick={() => pinBundle.mutate(bundle.id)}>
                  Ghim
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  loading={approveBundle.isPending}
                  onClick={() => approveBundle.mutate(bundle.id)}
                >
                  Duyệt
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={expanded === bundle.id}
                onClick={() => setExpanded((current) => (current === bundle.id ? null : bundle.id))}
              >
                {expanded === bundle.id ? 'Ẩn bộ ca' : 'Xem bộ ca'}
              </Button>
            </div>
            {bundle.approvedAt && (
              <p className="text-caption text-muted-foreground">Đã duyệt lúc {formatMoment(bundle.approvedAt)}</p>
            )}
            {expanded === bundle.id && (
              <CaseTable sessionId={sessionId} bundleId={bundle.id} approved={bundle.approvedAt !== null} drop={dropCase} />
            )}
          </div>
        );
      })}

      {dropCase.isError && (
        <Alert variant="destructive">
          <AlertDescription>{dropCase.error.message}</AlertDescription>
        </Alert>
      )}

      {/* Giới hạn mà spec §3.7 đòi nói thẳng — luôn bật, kể cả khi gói do giảng viên tự gõ. */}
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-caption text-muted-foreground">
        Đáp án và gói test cùng do hệ thống viết thì <strong>khớp nhau chưa chắc là đúng</strong>. Bộ ca chỉ thành
        thước khi bạn duyệt.
      </p>
    </div>
  );
}

function CaseTable({
  sessionId,
  bundleId,
  approved,
  drop,
}: {
  sessionId: string;
  bundleId: string;
  approved: boolean;
  drop: ReturnType<typeof useDropTestBundleCase>;
}) {
  const detail = useTestBundleDetail(sessionId, bundleId);
  if (detail.isLoading) return <p className="mt-2 text-caption text-muted-foreground">Đang tải bộ ca…</p>;
  if (detail.isError) {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertDescription>{detail.error?.message}</AlertDescription>
      </Alert>
    );
  }

  // Cột "câu trong đề mà ca này kiểm" là cột giảng viên cần đọc nhất, nên nó KHÔNG được ở độ rộng cố định:
  // bản `table-fixed` + bốn cột rộng cố định ép nó còn 32px (đo ở trình duyệt, khung 1360px), mỗi chữ một dòng.
  // Cột chữ nhận phần còn lại với `min-w`; màn hẹp hơn thì cuộn ngang thay vì bóp cột.
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-small">
      <caption className="sr-only">Bộ ca của gói test phiên bản này</caption>
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th scope="col" className="w-16 py-1 pr-2">Nhóm</th>
          <th scope="col" className="w-24 py-1 pr-2">Input</th>
          <th scope="col" className="w-24 py-1 pr-2">Output mong đợi</th>
          <th scope="col" className="min-w-[10rem] py-1 pr-2">Câu trong đề mà ca này kiểm</th>
          <th scope="col" className="w-24 py-1"><span className="sr-only">Thao tác</span></th>
        </tr>
      </thead>
      <tbody>
        {detail.data?.cases.map((c) => (
          <tr key={c.caseKey} className={c.autoDroppedReason ? 'text-muted-foreground line-through' : ''}>
            <td className="break-words py-1 pr-2 align-top">{c.group}</td>
            <td className="break-all py-1 pr-2 align-top font-mono text-caption">{c.input}</td>
            <td className="break-all py-1 pr-2 align-top font-mono text-caption">{c.expectedOutput}</td>
            <td className="py-1 pr-2 align-top">
              {c.autoDroppedReason ? (
                <span>Hệ thống đã bỏ ca này: {c.autoDroppedReason}</span>
              ) : c.constraintQuote ? (
                <span className="italic text-muted-foreground">“{c.constraintQuote}”</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-1 align-top">
              {!c.autoDroppedReason && !approved && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={drop.isPending}
                  onClick={() => drop.mutate({ bundleId, caseKey: c.caseKey })}
                >
                  Bỏ ca này
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}
