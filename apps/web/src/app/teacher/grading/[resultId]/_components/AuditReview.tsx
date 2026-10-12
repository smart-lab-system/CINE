'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useOpenDossierAfterAudit, useRecordAuditReview, useSubmissionDownload } from '@/hooks/useAudit';
import { useRules } from '@/hooks/useRules';
import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
import { AuditReveal } from './AuditReveal';

const MAX_EXTRA_LINES = 20;
const MAX_EXTRA_LENGTH = 500;

/**
 * Màn kiểm mù (parent spec §8.1): bài thuộc mẫu kiểm, điểm và lỗi hệ thống bị ẩn ở API. Giảng viên tick lỗi họ thấy
 * — từ bảng lỗi ĐANG DÙNG của chính họ — ghi thêm lỗi ngoài bảng, rồi ghi nhận xét. Ghi xong là khoá; bản tiết lộ
 * hiện ngay tại đây và ở lại cho tới khi họ bấm *Mở hồ sơ* (trang cha giữ panel, kể cả khi danh sách làm mới đổi
 * trạng thái bài).
 */
export function AuditReview({
  resultId,
  sessionId,
  studentMssv,
  studentName,
  onRecorded,
  onOpenDossier,
}: {
  resultId: string;
  sessionId: string;
  studentMssv: string;
  studentName: string;
  onRecorded: () => void;
  onOpenDossier: () => void;
}) {
  const [reveal, setReveal] = useState<AuditRevealData | null>(null);
  const record = useRecordAuditReview(resultId);
  const refreshDossier = useOpenDossierAfterAudit(sessionId, resultId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href={`/teacher/grading?sessionId=${sessionId}`}
          className="flex w-fit items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Về màn Điều phối
        </Link>
        <Badge variant="info" className="w-fit">
          Kiểm mẫu
        </Badge>
        <h1 className="text-h1">{studentName}</h1>
        <p className="text-caption text-muted-foreground">
          <span className="font-mono">{studentMssv}</span>
        </p>
      </div>

      {reveal ? (
        <AuditReveal
          reveal={reveal}
          onOpenDossier={() => {
            refreshDossier();
            onOpenDossier();
          }}
        />
      ) : (
        <>
          <Alert variant="info">
            <AlertDescription>
              Bài này được hệ thống chọn ngẫu nhiên để kiểm — không dựa vào điểm của nó. Hệ thống đã chấm xong, nhưng
              điểm và lỗi hệ thống đã giữ đang được ẩn cho tới khi bạn ghi nhận xét của mình. Bước này gần như chấm
              lại từ đầu, nên tốn công hơn một bài cần xem.
            </AlertDescription>
          </Alert>
          <SubmissionDownload resultId={resultId} />
          <ReviewForm
            pending={record.isPending}
            error={record.isError ? record.error : null}
            onSubmit={(body, onFailed) =>
              record.mutate(body, {
                onSuccess: (data) => {
                  setReveal(data);
                  onRecorded();
                },
                // Đóng hộp xác nhận để lỗi máy chủ hiện nguyên văn ở form, không bị hộp che.
                onError: onFailed,
              })
            }
          />
        </>
      )}
    </div>
  );
}

function SubmissionDownload({ resultId }: { resultId: string }) {
  const download = useSubmissionDownload(resultId);
  if (download.isLoading) return <Skeleton className="h-9 w-56" />;
  if (download.isError || !download.data) {
    return (
      <Alert variant="warning">
        <AlertDescription>{download.error?.message ?? 'Không lấy được đường dẫn tải bài nộp.'}</AlertDescription>
      </Alert>
    );
  }
  return (
    <a
      href={download.data.downloadUrl}
      rel="noopener"
      className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-small font-medium hover:bg-surface-2"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Tải bài nộp ({download.data.fileName})
    </a>
  );
}

function ReviewForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error: Error | null;
  onSubmit: (body: { pickedRuleIds: string[]; extraErrors: string[] }, onFailed: () => void) => void;
}) {
  const rules = useRules();
  const [picked, setPicked] = useState<string[]>([]);
  const [extraText, setExtraText] = useState('');
  const [confirmNone, setConfirmNone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const active = (rules.data ?? []).filter((r) => r.state === 'active');
  const extras = extraText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const tooMany = extras.length > MAX_EXTRA_LINES;
  const tooLong = extras.some((line) => line.length > MAX_EXTRA_LENGTH);
  const empty = picked.length === 0 && extras.length === 0;
  // Không nộp khi chưa có bảng lỗi: một nhãn thiếu phần chọn luật là dữ liệu sai chứ không phải nhãn "không có lỗi".
  const canSubmit = !pending && rules.data !== undefined && !tooMany && !tooLong && (!empty || confirmNone);

  const toggle = (id: string) => {
    setConfirmNone(false);
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          // Ghi là khoá: nút chỉ MỞ hộp xác nhận, gửi thật nằm trong hộp.
          if (canSubmit) setConfirming(true);
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Nhận xét của bạn về bài này</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-small text-muted-foreground">
              Tick những lỗi bạn thấy trong bài, theo bảng lỗi đang dùng của bạn. Lỗi nào chưa có trong bảng thì ghi ở ô
              bên dưới — mỗi dòng một lỗi.
            </p>

            {rules.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : rules.data === undefined ? (
              <Alert variant="destructive">
                <AlertDescription>{rules.error?.message ?? 'Không tải được bảng lỗi.'}</AlertDescription>
              </Alert>
            ) : active.length === 0 ? (
              <p className="text-small text-muted-foreground">
                Bạn chưa có luật nào đang dùng — ghi lỗi ở ô bên dưới, hoặc xác nhận bài không có lỗi nào.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-small font-semibold">Lỗi trong bảng lỗi của bạn</legend>
                {active.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-small">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-accent"
                      checked={picked.includes(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    <span>
                      <span className="font-medium">{r.revision.name}</span>
                      <span className="block text-caption text-muted-foreground">{r.revision.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-extra">Lỗi khác (không có trong bảng lỗi)</Label>
              <textarea
                id="audit-extra"
                rows={3}
                value={extraText}
                onChange={(event) => {
                  setConfirmNone(false);
                  setExtraText(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
              />
              {tooMany && <p className="text-caption text-danger-strong">Tối đa {MAX_EXTRA_LINES} lỗi khác.</p>}
              {tooLong && <p className="text-caption text-danger-strong">Mỗi lỗi tối đa {MAX_EXTRA_LENGTH} ký tự.</p>}
            </div>

            {empty && rules.data !== undefined && (
              <label className="flex cursor-pointer items-start gap-2 text-small">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-accent"
                  checked={confirmNone}
                  onChange={(event) => setConfirmNone(event.target.checked)}
                />
                <span>Tôi xác nhận: bài này không có lỗi nào</span>
              </label>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-caption text-muted-foreground">
            Ghi xong là khoá — bạn không sửa được nhận xét này nữa. Nếu sau đó bạn không đồng ý với hệ thống, dùng Ngoại
            lệ hoặc Chấm tay trong hồ sơ.
          </p>
          <Button type="submit" className="self-start" disabled={!canSubmit}>
            Ghi nhận xét và xem kết luận của hệ thống
          </Button>
        </div>
      </form>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi nhận xét kiểm mẫu?</DialogTitle>
            <DialogDescription>
              Nhận xét ghi rồi thì khoá, không sửa được. Sau đó bạn sẽ thấy điểm và lỗi hệ thống đã giữ cho bài này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Xem lại
            </Button>
            <Button
              type="button"
              loading={pending}
              onClick={() => onSubmit({ pickedRuleIds: picked, extraErrors: extras }, () => setConfirming(false))}
            >
              Ghi và khoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
