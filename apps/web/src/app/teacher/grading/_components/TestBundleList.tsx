'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { useBundleRuns } from '@/hooks/useBundleRuns';
import { useApproveTestBundle, usePinTestBundle, useTestBundles } from '@/hooks/useTestBundle';
import { useDropTestBundleCase, useTestBundleDetail } from '@/hooks/useTestBundleDetail';
import { caseVerdict, summarizeRun, type BundleRunState } from '@/lib/bundle-runs';
import { ApproveBundleDialog } from './ApproveBundleDialog';

type Runs = Pick<ReturnType<typeof useBundleRuns>, 'runs' | 'run' | 'pendingKey'>;

const formatMoment = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'không rõ lúc');

/**
 * Danh sách gói test + bảng duyệt bộ ca (UI spec §3.7, T-UI-18).
 *
 * Sáu cột: nhóm, input, output, câu trong đề mà ca kiểm, kết quả chạy thử, thao tác. Cột "câu trong đề mà ca này kiểm" đọc
 * `constraint_quote` — KHÔNG suy từ `group` (Security rule 9: cột nào kiểm cái gì phải được nói thẳng, không đoán), nên ca
 * giảng viên tự gõ hiện "—". Cột "Chạy thử" là kết quả lượt chạy đáp án mẫu gần nhất (G2b-R), chỉ còn trong phiên làm việc này.
 *
 * Ca hệ thống đã tự bỏ vẫn hiện, gạch ngang, kèm lý do, và không có nút chạy. Nó KHÔNG tính vào `caseCount`
 * (`TestBundleService.list` đã loại sẵn), nên con số ở đây là số ca THẬT sự chạy.
 *
 * Duyệt và ghim là MỘT nút: nút mở hộp thoại cho giảng viên đọc các ca, xác nhận thì duyệt rồi (khi duyệt thành công) ghim.
 */
export function TestBundleList({
  sessionId,
  pinnedBundleId,
  runs,
  onNewVersion,
  generating = false,
}: {
  sessionId: string;
  pinnedBundleId: string | null;
  runs: Runs;
  /** Bắt đầu một bản nháp từ phiên bản này (sửa ca = dựng phiên bản mới). */
  onNewVersion: (bundleId: string) => void;
  /** Đang sinh gói: mọi nút chạy thử khoá từ đầu (một việc nặng tại một thời điểm), không chờ máy chủ trả 409. */
  generating?: boolean;
}) {
  const bundles = useTestBundles(sessionId);
  const approveBundle = useApproveTestBundle(sessionId);
  const pinBundle = usePinTestBundle(sessionId);
  const dropCase = useDropTestBundleCase(sessionId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (bundles.isLoading) return <p className="text-muted-foreground">Đang tải…</p>;
  if ((bundles.data?.length ?? 0) === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-small text-muted-foreground">
        Chưa có gói test nào — bài code không chấm được cho tới khi có một gói đã duyệt và ghim (§14.3).
      </p>
    );
  }

  const busy = runs.pendingKey !== null || generating;
  const mutationError = approveBundle.isError ? approveBundle.error : pinBundle.isError ? pinBundle.error : null;

  return (
    <div className="flex flex-col gap-3">
      {bundles.data!.map((bundle) => {
        // Chỉ hai giá trị này mới là "hệ thống sinh"; `origin` vắng (API cũ) KHÔNG bị tính là hệ thống sinh.
        const systemMade = bundle.origin === 'generated' || bundle.origin === 'from_model_answer';
        const run = runs.runs[bundle.id];
        const summary = run && run.status !== 'compile_error' ? summarizeRun(run) : null;
        // Chưa đủ mọi ca của phiên bản (lượt bị cắt, hoặc mới chạy lẻ vài ca): con số phải nói rõ là một phần.
        const partial = summary !== null && summary.total < bundle.caseCount;
        return (
          <div key={bundle.id} className="rounded-md border border-border bg-surface p-3 text-small">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Phiên bản {bundle.version}</span>
              <span className="text-caption text-muted-foreground">{bundle.caseCount} ca</span>
              {systemMade && <Badge variant="warning">Thước do hệ thống sinh</Badge>}
              {bundle.id === pinnedBundleId ? (
                <Badge variant="accent">Đang dùng</Badge>
              ) : bundle.approvedAt ? (
                <Button type="button" size="sm" variant="outline" loading={pinBundle.isPending} onClick={() => pinBundle.mutate(bundle.id)}>
                  Ghim
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" loading={approveBundle.isPending} onClick={() => setReviewing(bundle.id)}>
                  Duyệt và ghim
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => runs.run(bundle.id)}>
                {runs.pendingKey === bundle.id ? 'Đang chạy…' : 'Chạy thử tất cả'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onNewVersion(bundle.id)}>
                Tạo phiên bản mới từ gói này
              </Button>
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
            {summary && partial && run?.status === 'aborted' && (
              <p className="mt-1 text-caption font-medium text-warning-strong">
                {`Chạy chưa hết (hết thời gian): ${summary.total} trên ${bundle.caseCount} ca đã chạy — chưa kết luận cả gói.`}
              </p>
            )}
            {summary && !(partial && run?.status === 'aborted') && (
              <p className="mt-1 text-caption font-medium">
                {`${summary.matched} khớp, ${summary.mismatched} lệch${partial ? ` — ${summary.total} trên ${bundle.caseCount} ca đã chạy` : ''}`}
              </p>
            )}
            {run?.status === 'compile_error' && (
              <div className="mt-1 text-caption text-danger-strong">
                <p className="font-medium">Đáp án không biên dịch được — chưa chạy ca nào.</p>
                {run.compileLog && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono">{run.compileLog}</pre>}
              </div>
            )}
            {expanded === bundle.id && (
              <CaseTable
                sessionId={sessionId}
                bundleId={bundle.id}
                approved={bundle.approvedAt !== null}
                drop={dropCase}
                run={run}
                runs={runs}
                locked={busy}
              />
            )}
            <ApproveBundleDialog
              sessionId={sessionId}
              bundle={{ id: bundle.id, version: bundle.version }}
              open={reviewing === bundle.id}
              onOpenChange={(next) => setReviewing(next ? bundle.id : null)}
              onConfirm={() => approveBundle.mutate(bundle.id, { onSuccess: () => pinBundle.mutate(bundle.id) })}
            />
          </div>
        );
      })}

      {dropCase.isError && (
        <Alert variant="destructive">
          <AlertDescription>{dropCase.error.message}</AlertDescription>
        </Alert>
      )}
      {mutationError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{mutationError.message}</AlertDescription>
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
  run,
  runs,
  locked,
}: {
  sessionId: string;
  bundleId: string;
  /** Khoá các nút chạy: đang chạy một lượt, hoặc đang sinh gói. */
  locked: boolean;
  approved: boolean;
  drop: ReturnType<typeof useDropTestBundleCase>;
  run: BundleRunState | undefined;
  runs: Runs;
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
      <table className="w-full min-w-[36rem] text-left text-small">
        <caption className="sr-only">Bộ ca của gói test phiên bản này</caption>
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th scope="col" className="w-16 py-1 pr-2">Nhóm</th>
            <th scope="col" className="w-24 py-1 pr-2">Input</th>
            <th scope="col" className="w-24 py-1 pr-2">Output mong đợi</th>
            <th scope="col" className="min-w-[10rem] py-1 pr-2">Câu trong đề mà ca này kiểm</th>
            <th scope="col" className="w-32 py-1 pr-2">Chạy thử</th>
            <th scope="col" className="w-36 py-1"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>
          {detail.data?.cases.map((c) => {
            const result = run?.cases[c.caseKey];
            const verdict = result ? caseVerdict(result.status) : null;
            return (
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
                <td className="py-1 pr-2 align-top">
                  {c.autoDroppedReason ? (
                    '—'
                  ) : verdict ? (
                    <div className="flex flex-col gap-0.5">
                      <Badge variant={verdict.tone === 'ok' ? 'success' : 'destructive'}>{verdict.label}</Badge>
                      {result?.diff && <span className="break-words text-caption text-muted-foreground">{result.diff}</span>}
                    </div>
                  ) : (
                    <span className="text-caption text-muted-foreground">Chưa chạy</span>
                  )}
                </td>
                <td className="py-1 align-top">
                  {!c.autoDroppedReason && (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Chạy thử ca ${c.caseKey}`}
                        disabled={locked}
                        onClick={() => runs.run(bundleId, c.caseKey)}
                      >
                        {runs.pendingKey === `${bundleId}:${c.caseKey}` ? 'Đang chạy…' : 'Chạy'}
                      </Button>
                      {!approved && (
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
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
